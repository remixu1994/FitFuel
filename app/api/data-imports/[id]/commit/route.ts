import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/server/http";
import { calculateMetabolism } from "@/shared/domain/nutrition";
export const dynamic = "force-dynamic";

type Source = "meals" | "manual" | "import";
type Decision = {
  date?: string;
  source?: Source;
  useImportedWeight?: boolean;
  useImportedActivity?: boolean;
};

function snapshot(record: NonNullable<Awaited<ReturnType<typeof prisma.daily_record.findUnique>>>) {
  return {
    weight_kg: record.weight_kg === null ? null : Number(record.weight_kg),
    calories_consumed: record.calories_consumed,
    meal_calories: record.meal_calories,
    manual_calories: record.manual_calories,
    imported_calories: record.imported_calories,
    activity_calories: Number(record.activity_calories),
    bmr: Number(record.bmr),
    tef: Number(record.tef),
    tdee: Number(record.tdee),
    calorie_balance: Number(record.calorie_balance),
    calories_source: record.calories_source,
    import_batch_id: record.import_batch_id?.toString() ?? null,
    note: record.note,
    deleted_at: record.deleted_at?.toISOString() ?? null
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) throw new ApiError(400, "导入批次无效");
    const batchId = BigInt(id);
    const body = await readJson<{ defaultSource?: Source; decisions?: Decision[] }>(request);
    const defaultSource = body.defaultSource ?? "import";
    if (!["meals", "manual", "import"].includes(defaultSource)) throw new ApiError(400, "默认摄入来源无效");
    const decisions = new Map((body.decisions ?? []).map(item => [String(item.date), item]));

    const batch = await prisma.daily_data_import_batch.findFirst({
      where: { id: batchId, user_id: BigInt(user.id) },
      include: { daily_data_import_row: { orderBy: { record_date: "asc" } } }
    });
    if (!batch) throw new ApiError(404, "导入批次不存在");
    if (batch.status !== "preview") throw new ApiError(409, "该导入批次已处理");
    if (batch.expires_at < new Date()) throw new ApiError(410, "导入预览已过期，请重新上传");

    const profile = await prisma.user_profile.findUnique({ where: { user_id: BigInt(user.id) } });
    if (!profile) throw new ApiError(400, "请先完善个人资料");

    await prisma.$transaction(async tx => {
      for (const row of batch.daily_data_import_row) {
        const date = row.record_date.toISOString().slice(0, 10);
        const current = await tx.daily_record.findUnique({
          where: { user_id_record_date: { user_id: BigInt(user.id), record_date: row.record_date } }
        });
        const activeCurrent = current?.deleted_at ? null : current;
        const decision = decisions.get(date);
        let source = decision?.source ?? defaultSource;
        const available = new Set<Source>(["import"]);
        if (activeCurrent && activeCurrent.meal_calories > 0) available.add("meals");
        if (activeCurrent?.manual_calories !== null && activeCurrent?.manual_calories !== undefined) available.add("manual");
        if (!available.has(source)) source = "import";

        const importedCalories = row.imported_calories;
        const calories = source === "meals"
          ? Number(activeCurrent?.meal_calories ?? 0)
          : source === "manual"
            ? Number(activeCurrent?.manual_calories ?? 0)
            : importedCalories;
        const useWeight = !activeCurrent?.weight_kg || Boolean(decision?.useImportedWeight);
        const useActivity = !activeCurrent || Boolean(decision?.useImportedActivity);
        const weight = useWeight ? Number(row.imported_weight_kg) : Number(activeCurrent?.weight_kg);
        const activity = useActivity ? Number(row.imported_activity_calories) : Number(activeCurrent?.activity_calories ?? 0);
        const values = calculateMetabolism(weight, calories, activity, {
          height: Number(profile.height_cm),
          age: profile.age,
          gender: profile.gender as "male" | "female" | "other"
        });
        const changedAt = new Date();
        const saved = await tx.daily_record.upsert({
          where: { user_id_record_date: { user_id: BigInt(user.id), record_date: row.record_date } },
          create: {
            user_id: BigInt(user.id),
            record_date: row.record_date,
            weight_kg: weight,
            calories_consumed: calories,
            meal_calories: 0,
            manual_calories: null,
            imported_calories: importedCalories,
            activity_calories: activity,
            bmr: values.bmr,
            tef: values.tef,
            tdee: values.tdee,
            calorie_balance: values.calorieBalance,
            calories_source: source,
            import_batch_id: batchId,
            updated_at: changedAt
          },
          update: {
            weight_kg: weight,
            calories_consumed: calories,
            imported_calories: importedCalories,
            activity_calories: activity,
            bmr: values.bmr,
            tef: values.tef,
            tdee: values.tdee,
            calorie_balance: values.calorieBalance,
            calories_source: source,
            import_batch_id: batchId,
            deleted_at: null,
            updated_at: changedAt
          }
        });
        await tx.daily_data_import_row.update({
          where: { id: row.id },
          data: {
            selected_source: source,
            use_imported_weight: useWeight,
            use_imported_activity: useActivity,
            before_snapshot: current ? snapshot(current) : undefined,
            after_updated_at: saved.updated_at
          }
        });
      }
      await tx.daily_data_import_batch.update({
        where: { id: batchId },
        data: { status: "committed", committed_at: new Date(), updated_at: new Date() }
      });
    }, { timeout: 30_000 });

    return NextResponse.json({ ok: true, batchId: Number(batchId), imported: batch.row_count });
  } catch (error) {
    return jsonError(error);
  }
}
