import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { calculateMetabolism } from "@/lib/nutrition";
import { deleteBatchImages, readStoredImage } from "@/lib/elevatine-storage";
import { estimateFoodPortionWithMimo } from "@/lib/mimo";
import { parseElevatineImage } from "@/lib/mimo-vision";
import type { ParsedElevatineImage } from "@/lib/elevatine-types";

const decimal = (value: number | null) => value === null ? null : new Prisma.Decimal(value);
const number = (value: Prisma.Decimal | number | null | undefined) => value == null ? null : Number(value);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const jsonSafe = (value: unknown) => JSON.parse(JSON.stringify(value, (_, item) =>
  typeof item === "bigint" ? item.toString() : Prisma.Decimal.isDecimal(item) ? Number(item) : item
));

function dateFromParts(year: number, month: number, day: number) {
  const text = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (isoDate(date) !== text) throw new ApiError(422, `无法生成有效日期：${text}`);
  return date;
}

function norm(value: string) {
  return value.replace(/[\s（）()·・]/g, "").toLowerCase();
}

function dedupeKey(meal: string, name: string, quantity: number | null, unit: string | null, calories: number) {
  return [norm(meal), norm(name), quantity ?? "", norm(unit || ""), Math.round(calories * 10) / 10].join("|");
}

async function ownedBatch(id: bigint, userId: number) {
  const batch = await prisma.elevatine_import_batch.findFirst({
    where: { id, user_id: BigInt(userId) }
  });
  if (!batch) throw new ApiError(404, "同步批次不存在");
  return batch;
}

async function parallelLimit<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await work(item);
    }
  }));
}

async function enrichMissingBatchItems(batchId: bigint) {
  const items = await prisma.elevatine_import_item.findMany({
    where: {
      selected: true,
      elevatine_import_day: { batch_id: batchId },
      OR: [
        { calories: { lte: 0 } },
        { carbohydrate: null },
        { protein: null },
        { fat: null }
      ]
    },
    orderBy: { id: "asc" }
  });
  const estimates = new Map<string, ReturnType<typeof estimateFoodPortionWithMimo>>();
  await parallelLimit(items, 3, async item => {
    const unit = item.unit || "份";
    const isMass = /^(g|克|ml|毫升)$/i.test(unit.trim());
    const baseQuantity = isMass ? 100 : 1;
    const multiplier = (number(item.quantity) ?? baseQuantity) / baseQuantity;
    const key = [
      norm(item.food_name),
      norm(unit)
    ].join("|");
    let pending = estimates.get(key);
    if (!pending) {
      pending = estimateFoodPortionWithMimo(
        item.food_name,
        baseQuantity,
        unit
      );
      estimates.set(key, pending);
    }
    try {
      const estimate = await pending;
      const scaled = (value: number) => Math.round(value * multiplier * 100) / 100;
      await prisma.elevatine_import_item.update({
        where: { id: item.id },
        data: {
          calories: decimal(scaled(estimate.calories))!,
          carbohydrate: decimal(scaled(estimate.carbohydrate)),
          protein: decimal(scaled(estimate.protein)),
          fat: decimal(scaled(estimate.fat)),
          confidence: decimal(estimate.confidence),
          match_status: "estimated",
          updated_at: new Date()
        }
      });
    } catch (error) {
      console.error("Elavatine nutrition estimate failed", {
        itemId: item.id.toString(),
        foodName: item.food_name,
        quantity: number(item.quantity),
        unit: item.unit,
        error
      });
      await prisma.elevatine_import_item.update({
        where: { id: item.id },
        data: { match_status: "estimate_failed", updated_at: new Date() }
      });
    }
  });
}

export async function parseBatch(batchId: bigint, userId: number, retryImageId?: bigint) {
  const batch = await ownedBatch(batchId, userId);
  if (!["uploaded", "parsing", "review", "failed"].includes(batch.status)) {
    throw new ApiError(409, "当前批次不能继续解析");
  }
  const images = await prisma.elevatine_import_image.findMany({
    where: {
      batch_id: batchId,
      ...(retryImageId
        ? { id: retryImageId, status: { in: ["failed", "uploaded"] } }
        : { status: { in: ["uploaded", "failed"] } })
    },
    orderBy: { id: "asc" }
  });
  await prisma.elevatine_import_batch.update({
    where: { id: batchId },
    data: { status: "parsing", updated_at: new Date() }
  });
  await parallelLimit(images, 3, async image => {
    await prisma.elevatine_import_image.update({
      where: { id: image.id },
      data: { status: "parsing", error_message: null }
    });
    try {
      const parsed = await parseElevatineImage(await readStoredImage(image.storage_key));
      await prisma.elevatine_import_image.update({
        where: { id: image.id },
        data: {
          status: "parsed",
          image_kind: parsed.kind,
          parsed_json: parsed as unknown as Prisma.InputJsonValue,
          confidence: decimal(parsed.confidence),
          error_message: null,
          updated_at: new Date()
        }
      });
    } catch (error) {
      await prisma.elevatine_import_image.update({
        where: { id: image.id },
        data: {
          status: "failed",
          error_message: error instanceof Error ? error.message : "解析失败",
          updated_at: new Date()
        }
      });
    }
  });
  await rebuildReview(batchId);
  await enrichMissingBatchItems(batchId);
  const failed = await prisma.elevatine_import_image.count({ where: { batch_id: batchId, status: "failed" } });
  const parsed = await prisma.elevatine_import_image.count({ where: { batch_id: batchId, status: "parsed" } });
  await prisma.elevatine_import_batch.update({
    where: { id: batchId },
    data: { status: parsed ? "review" : failed ? "failed" : "uploaded", updated_at: new Date() }
  });
}

async function rebuildReview(batchId: bigint) {
  const batch = await prisma.elevatine_import_batch.findUniqueOrThrow({ where: { id: batchId } });
  const images = await prisma.elevatine_import_image.findMany({
    where: { batch_id: batchId, status: "parsed" },
    orderBy: { id: "asc" }
  });
  const existingItems = await prisma.elevatine_import_item.count({
    where: { elevatine_import_day: { batch_id: batchId } }
  });
  if (existingItems) return;
  const summaries = images
    .map(image => ({ image, parsed: image.parsed_json as unknown as ParsedElevatineImage }))
    .filter(entry => entry.parsed?.kind === "summary");
  for (const { image, parsed } of summaries) {
    if (parsed.kind !== "summary") continue;
    const date = dateFromParts(parsed.year || batch.default_year, parsed.month, parsed.day);
    const existing = await prisma.elevatine_import_day.findUnique({
      where: { batch_id_record_date: { batch_id: batchId, record_date: date } }
    });
    if (existing) {
      const same = existing.calories === parsed.calories
        && number(existing.carbohydrate) === parsed.carbohydrate
        && number(existing.protein) === parsed.protein
        && number(existing.fat) === parsed.fat;
      const warnings = Array.isArray(existing.warnings) ? existing.warnings as string[] : [];
      await prisma.elevatine_import_day.update({
        where: { id: existing.id },
        data: { warnings: [...warnings, same ? "检测到重复汇总截图" : "同一天存在冲突的汇总值"] }
      });
      continue;
    }
    const day = await prisma.elevatine_import_day.create({
      data: {
        batch_id: batchId,
        record_date: date,
        calories: parsed.calories,
        carbohydrate: decimal(parsed.carbohydrate),
        protein: decimal(parsed.protein),
        fat: decimal(parsed.fat),
        calories_goal: parsed.caloriesGoal == null ? null : Math.round(parsed.caloriesGoal),
        carbohydrate_goal: decimal(parsed.carbohydrateGoal),
        protein_goal: decimal(parsed.proteinGoal),
        fat_goal: decimal(parsed.fatGoal),
        warnings: []
      }
    });
    await prisma.elevatine_import_image.update({ where: { id: image.id }, data: { assigned_date: date } });
    const seen = new Set<string>();
    for (const meal of parsed.meals) {
      for (const food of meal.foods) {
        const key = dedupeKey(meal.label, food.name, food.quantity, food.unit, food.calories);
        if (seen.has(key)) continue;
        seen.add(key);
        await prisma.elevatine_import_item.create({
          data: {
            day_id: day.id,
            image_id: image.id,
            meal_label: meal.label,
            meal_order: meal.order,
            meal_time: meal.time,
            food_name: food.name,
            quantity: decimal(food.quantity),
            unit: food.unit,
            calories: decimal(food.calories)!,
            carbohydrate: decimal(food.carbohydrate),
            protein: decimal(food.protein),
            fat: decimal(food.fat),
            confidence: decimal(food.confidence),
            dedupe_key: key
          }
        });
      }
    }
  }
  const detailImages = images
    .map(image => ({ image, parsed: image.parsed_json as unknown as ParsedElevatineImage }))
    .filter(entry => entry.parsed?.kind === "detail");
  for (const { image, parsed } of detailImages) {
    if (parsed.kind !== "detail") continue;
    const candidates = await prisma.elevatine_import_item.findMany({
      where: {
        elevatine_import_day: { batch_id: batchId },
        food_name: { contains: parsed.food.name, mode: "insensitive" }
      }
    });
    const close = candidates.filter(item =>
      Math.abs(Number(item.calories) - parsed.food.calories) <= Math.max(3, parsed.food.calories * .05)
    );
    if (close.length === 1) {
      const target = close[0];
      await prisma.elevatine_import_item.update({
        where: { id: target.id },
        data: {
          image_id: image.id,
          quantity: decimal(parsed.food.quantity) ?? target.quantity,
          unit: parsed.food.unit || target.unit,
          calories: decimal(parsed.food.calories)!,
          carbohydrate: decimal(parsed.food.carbohydrate),
          protein: decimal(parsed.food.protein),
          fat: decimal(parsed.food.fat),
          confidence: decimal(parsed.food.confidence),
          match_status: "matched"
        }
      });
      if (target.day_id) {
        const day = await prisma.elevatine_import_day.findUniqueOrThrow({ where: { id: target.day_id } });
        await prisma.elevatine_import_image.update({
          where: { id: image.id },
          data: { assigned_date: day.record_date }
        });
      }
    } else {
      await prisma.elevatine_import_item.create({
        data: {
          image_id: image.id,
          meal_label: "待分配",
          meal_order: 1,
          food_name: parsed.food.name,
          quantity: decimal(parsed.food.quantity),
          unit: parsed.food.unit,
          calories: decimal(parsed.food.calories)!,
          carbohydrate: decimal(parsed.food.carbohydrate),
          protein: decimal(parsed.food.protein),
          fat: decimal(parsed.food.fat),
          confidence: decimal(parsed.food.confidence),
          match_status: close.length > 1 ? "ambiguous" : "unmatched",
          dedupe_key: dedupeKey("待分配", parsed.food.name, parsed.food.quantity, parsed.food.unit, parsed.food.calories)
        }
      });
    }
  }
}

export async function getBatchReview(batchId: bigint, userId: number) {
  await ownedBatch(batchId, userId);
  const batch = await prisma.elevatine_import_batch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      elevatine_import_image: { orderBy: { id: "asc" } },
      elevatine_import_day: {
        orderBy: { record_date: "asc" },
        include: { elevatine_import_item: { orderBy: [{ meal_order: "asc" }, { id: "asc" }] } }
      }
    }
  });
  const unmatched = await prisma.elevatine_import_item.findMany({
    where: { image_id: { in: batch.elevatine_import_image.map(image => image.id) }, day_id: null }
  });
  return jsonSafe({ ...batch, unmatched });
}

export type BatchPatch = {
  defaultYear?: number;
  days?: Array<{
    id: string;
    selected?: boolean;
    recordDate?: string;
    calories?: number;
    carbohydrate?: number | null;
    protein?: number | null;
    fat?: number | null;
  }>;
  items?: Array<{
    id: string;
    dayId?: string;
    selected?: boolean;
    mealLabel?: string;
    mealOrder?: number;
    mealTime?: string | null;
    foodName?: string;
    quantity?: number | null;
    unit?: string | null;
    calories?: number;
    carbohydrate?: number | null;
    protein?: number | null;
    fat?: number | null;
  }>;
};

export async function patchBatch(batchId: bigint, userId: number, patch: BatchPatch) {
  const batch = await ownedBatch(batchId, userId);
  if (batch.status !== "review") throw new ApiError(409, "只有待审核批次可以修改");
  await prisma.$transaction(async tx => {
    if (patch.defaultYear) {
      await tx.elevatine_import_batch.update({
        where: { id: batchId },
        data: { default_year: patch.defaultYear, updated_at: new Date() }
      });
    }
    for (const day of patch.days || []) {
      const id = BigInt(day.id);
      const owned = await tx.elevatine_import_day.findFirst({ where: { id, batch_id: batchId } });
      if (!owned) throw new ApiError(404, "审核日期不存在");
      await tx.elevatine_import_day.update({
        where: { id },
        data: {
          selected: day.selected,
          record_date: day.recordDate ? new Date(`${day.recordDate}T00:00:00Z`) : undefined,
          calories: day.calories == null ? undefined : Math.round(day.calories),
          carbohydrate: day.carbohydrate === undefined ? undefined : decimal(day.carbohydrate),
          protein: day.protein === undefined ? undefined : decimal(day.protein),
          fat: day.fat === undefined ? undefined : decimal(day.fat),
          updated_at: new Date()
        }
      });
    }
    for (const item of patch.items || []) {
      const id = BigInt(item.id);
      const owned = await tx.elevatine_import_item.findFirst({
        where: {
          id,
          OR: [
            { elevatine_import_day: { batch_id: batchId } },
            { elevatine_import_image: { batch_id: batchId } }
          ]
        }
      });
      if (!owned) throw new ApiError(404, "食品审核项不存在");
      const dayId = item.dayId ? BigInt(item.dayId) : undefined;
      if (dayId && !await tx.elevatine_import_day.findFirst({ where: { id: dayId, batch_id: batchId } })) {
        throw new ApiError(404, "目标日期不存在");
      }
      await tx.elevatine_import_item.update({
        where: { id },
        data: {
          day_id: dayId,
          selected: item.selected,
          meal_label: item.mealLabel,
          meal_order: item.mealOrder,
          meal_time: item.mealTime,
          food_name: item.foodName,
          quantity: item.quantity === undefined ? undefined : decimal(item.quantity),
          unit: item.unit,
          calories: item.calories == null ? undefined : decimal(item.calories)!,
          carbohydrate: item.carbohydrate === undefined ? undefined : decimal(item.carbohydrate),
          protein: item.protein === undefined ? undefined : decimal(item.protein),
          fat: item.fat === undefined ? undefined : decimal(item.fat),
          match_status: dayId ? "matched" : undefined,
          updated_at: new Date()
        }
      });
    }
  });
}

export async function commitBatch(batchId: bigint, userId: number) {
  const batch = await ownedBatch(batchId, userId);
  if (batch.status === "committed") return getBatchReview(batchId, userId);
  if (batch.status !== "review") throw new ApiError(409, "当前批次不能提交");
  const unresolved = await prisma.elevatine_import_item.count({
    where: {
      image_id: { in: (await prisma.elevatine_import_image.findMany({ where: { batch_id: batchId }, select: { id: true } })).map(x => x.id) },
      selected: true,
      day_id: null
    }
  });
  if (unresolved) throw new ApiError(422, `还有 ${unresolved} 个食品详情未分配日期`);
  await prisma.$transaction(async tx => {
    const days = await tx.elevatine_import_day.findMany({
      where: { batch_id: batchId, selected: true },
      include: { elevatine_import_item: { where: { selected: true }, orderBy: [{ meal_order: "asc" }, { id: "asc" }] } }
    });
    const profile = await tx.user_profile.findUnique({ where: { user_id: BigInt(userId) } });
    if (!profile) throw new ApiError(422, "请先完善个人资料后再同步");
    for (const day of days) {
      let record = await tx.daily_record.findUnique({
        where: { user_id_record_date: { user_id: BigInt(userId), record_date: day.record_date } },
        include: { meal: { where: { source: "elevatine", deleted_at: null }, include: { meal_item: { where: { deleted_at: null } } } } }
      });
      if (!record) {
        record = await tx.daily_record.create({
          data: { user_id: BigInt(userId), record_date: day.record_date },
          include: { meal: { include: { meal_item: true } } }
        });
      }
      const snapshot = jsonSafe(record);
      await tx.elevatine_import_day.update({ where: { id: day.id }, data: { before_snapshot: snapshot } });
      await tx.meal.updateMany({
        where: { daily_record_id: record.id, source: "elevatine", deleted_at: null },
        data: { deleted_at: new Date() }
      });
      const grouped = new Map<string, typeof day.elevatine_import_item>();
      for (const item of day.elevatine_import_item) {
        const key = `${item.meal_order}|${item.meal_label}|${item.meal_time || ""}`;
        grouped.set(key, [...(grouped.get(key) || []), item]);
      }
      for (const [key, items] of grouped) {
        const [orderText, label, time] = key.split("|");
        const consumedAt = time
          ? new Date(`${isoDate(day.record_date)}T${time}:00+08:00`)
          : null;
        await tx.meal.create({
          data: {
            daily_record_id: record.id,
            meal_type: `elevatine_${orderText}`,
            display_name: label,
            sort_order: Number(orderText) * 10,
            consumed_at: consumedAt,
            source: "elevatine",
            elevatine_batch_id: batchId,
            meal_item: {
              create: items.map(item => ({
                food_name_snapshot: item.food_name,
                quantity: item.quantity || new Prisma.Decimal(1),
                unit: item.unit || "份",
                calories_snapshot: item.calories,
                carbohydrate_snapshot: item.carbohydrate || new Prisma.Decimal(0),
                protein_snapshot: item.protein || new Prisma.Decimal(0),
                fat_snapshot: item.fat || new Prisma.Decimal(0),
                source: "elevatine"
              }))
            }
          }
        });
      }
      const intake = day.calories;
      const weight = Number(record.weight_kg || 0);
      const metabolism = weight > 0
        ? calculateMetabolism(weight, intake, Number(record.activity_calories), {
            height: Number(profile.height_cm),
            age: profile.age,
            gender: profile.gender as "male" | "female" | "other"
          })
        : {
            bmr: 0,
            tef: intake * .08,
            tdee: Number(record.activity_calories) + intake * .08,
            calorieBalance: Number(record.activity_calories) - intake * .92
          };
      const updated = await tx.daily_record.update({
        where: { id: record.id },
        data: {
          elevatine_calories: intake,
          elevatine_carbohydrate: day.carbohydrate,
          elevatine_protein: day.protein,
          elevatine_fat: day.fat,
          calories_consumed: intake,
          calories_source: "elevatine",
          macro_source: "elevatine",
          elevatine_batch_id: batchId,
          bmr: new Prisma.Decimal(metabolism.bmr),
          tef: new Prisma.Decimal(metabolism.tef),
          tdee: new Prisma.Decimal(metabolism.tdee),
          calorie_balance: new Prisma.Decimal(metabolism.calorieBalance),
          deleted_at: null,
          updated_at: new Date()
        }
      });
      await tx.elevatine_import_day.update({
        where: { id: day.id },
        data: { after_updated_at: updated.updated_at }
      });
    }
    await tx.elevatine_import_batch.update({
      where: { id: batchId },
      data: { status: "committed", committed_at: new Date(), updated_at: new Date() }
    });
  }, { timeout: 30_000 });
  await deleteBatchImages(batchId);
  return getBatchReview(batchId, userId);
}

export async function rollbackBatch(batchId: bigint, userId: number) {
  const batch = await ownedBatch(batchId, userId);
  if (batch.status !== "committed") throw new ApiError(409, "只有已提交批次可以撤销");
  const newer = await prisma.elevatine_import_batch.findFirst({
    where: { user_id: BigInt(userId), status: "committed", committed_at: { gt: batch.committed_at! } }
  });
  if (newer) throw new ApiError(409, "只能撤销最近一次有效的 Elavatine 同步");
  const days = await prisma.elevatine_import_day.findMany({ where: { batch_id: batchId, selected: true } });
  const conflicts: string[] = [];
  for (const day of days) {
    const current = await prisma.daily_record.findUnique({
      where: { user_id_record_date: { user_id: BigInt(userId), record_date: day.record_date } }
    });
    if (!current || !day.after_updated_at || current.updated_at.getTime() !== day.after_updated_at.getTime()) {
      conflicts.push(isoDate(day.record_date));
    }
  }
  if (conflicts.length) throw new ApiError(409, `以下日期同步后又被修改，无法自动撤销：${conflicts.join("、")}`);
  await prisma.$transaction(async tx => {
    for (const day of days) {
      const snapshot = day.before_snapshot as Record<string, unknown> | null;
      const record = await tx.daily_record.findUniqueOrThrow({
        where: { user_id_record_date: { user_id: BigInt(userId), record_date: day.record_date } }
      });
      await tx.meal.updateMany({
        where: { daily_record_id: record.id, source: "elevatine", deleted_at: null },
        data: { deleted_at: new Date() }
      });
      if (snapshot) {
        await tx.daily_record.update({
          where: { id: record.id },
          data: {
            calories_consumed: Number(snapshot.calories_consumed || 0),
            calories_source: String(snapshot.calories_source || "manual"),
            elevatine_calories: snapshot.elevatine_calories == null ? null : Number(snapshot.elevatine_calories),
            elevatine_carbohydrate: snapshot.elevatine_carbohydrate == null ? null : decimal(Number(snapshot.elevatine_carbohydrate)),
            elevatine_protein: snapshot.elevatine_protein == null ? null : decimal(Number(snapshot.elevatine_protein)),
            elevatine_fat: snapshot.elevatine_fat == null ? null : decimal(Number(snapshot.elevatine_fat)),
            macro_source: String(snapshot.macro_source || "meals"),
            elevatine_batch_id: snapshot.elevatine_batch_id ? BigInt(String(snapshot.elevatine_batch_id)) : null,
            bmr: decimal(Number(snapshot.bmr || 0))!,
            tef: decimal(Number(snapshot.tef || 0))!,
            tdee: decimal(Number(snapshot.tdee || 0))!,
            calorie_balance: decimal(Number(snapshot.calorie_balance || 0))!,
            updated_at: new Date()
          }
        });
        const oldMeals = Array.isArray(snapshot.meal) ? snapshot.meal as Array<Record<string, unknown>> : [];
        for (const old of oldMeals) {
          const created = await tx.meal.create({
            data: {
              daily_record_id: record.id,
              meal_type: String(old.meal_type),
              display_name: String(old.display_name),
              sort_order: Number(old.sort_order || 0),
              consumed_at: old.consumed_at ? new Date(String(old.consumed_at)) : null,
              source: "elevatine",
              elevatine_batch_id: old.elevatine_batch_id ? BigInt(String(old.elevatine_batch_id)) : null
            }
          });
          for (const item of (old.meal_item || []) as Array<Record<string, unknown>>) {
            await tx.meal_item.create({
              data: {
                meal_id: created.id,
                food_name_snapshot: String(item.food_name_snapshot),
                quantity: decimal(Number(item.quantity || 1))!,
                unit: String(item.unit || "份"),
                calories_snapshot: decimal(Number(item.calories_snapshot || 0))!,
                carbohydrate_snapshot: decimal(Number(item.carbohydrate_snapshot || 0))!,
                protein_snapshot: decimal(Number(item.protein_snapshot || 0))!,
                fat_snapshot: decimal(Number(item.fat_snapshot || 0))!,
                dietary_fiber_snapshot: decimal(Number(item.dietary_fiber_snapshot || 0))!,
                source: "elevatine"
              }
            });
          }
        }
      }
    }
    await tx.elevatine_import_batch.update({
      where: { id: batchId },
      data: { status: "rolled_back", rolled_back_at: new Date(), updated_at: new Date() }
    });
  }, { timeout: 30_000 });
}

export async function cleanupExpiredElevatineImages() {
  const expired = await prisma.elevatine_import_batch.findMany({
    where: {
      expires_at: { lt: new Date() },
      status: { in: ["uploaded", "parsing", "review", "failed"] }
    },
    select: { id: true }
  });
  for (const batch of expired) {
    await deleteBatchImages(batch.id);
    await prisma.elevatine_import_batch.update({
      where: { id: batch.id },
      data: { status: "expired", updated_at: new Date() }
    });
  }
}
