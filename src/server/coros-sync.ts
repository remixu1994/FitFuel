import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { loginToCoros, queryCorosActivities, type CorosActivity } from "@/server/coros";
import { PrismaQueryClient, prisma } from "@/server/db";
import { recalculateDailyRecord } from "@/server/services/nutrition";

const DATE_PATTERN = /^2026-\d{2}-\d{2}$/;
const PAGE_SIZE = 20;
const MAX_PAGES = 100;

type NormalizedActivity = {
  externalId: string;
  date: string;
  name: string | null;
  sportType: number | null;
  mode: number | null;
  startTime: Date | null;
  endTime: Date | null;
  durationSeconds: number | null;
  calorieRaw: bigint;
  caloriesKcal: Prisma.Decimal;
  rawPayload: Prisma.InputJsonValue;
};

export type CorosSyncResult = {
  batchId: number;
  activityCount: number;
  dayCount: number;
  days: Array<{
    date: string;
    activityCount: number;
    caloriesKcal: number;
  }>;
};

function compactDate(date: string) {
  if (!DATE_PATTERN.test(date)) {
    throw new Error("COROS 同步当前仅支持 2026 年，日期格式必须为 YYYY-MM-DD");
  }
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error("COROS 同步日期无效");
  }
  return date.replaceAll("-", "");
}

function dateValue(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function activityDate(activity: CorosActivity) {
  const raw = String(activity.date ?? "");
  if (!/^2026\d{4}$/.test(raw)) throw new Error(`COROS 活动日期无效：${raw || "空"}`);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function unixTime(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normalizeActivity(activity: CorosActivity): NormalizedActivity {
  const date = activityDate(activity);
  const calorieRawNumber = Math.max(0, finiteInteger(activity.calorie) ?? 0);
  const rawJson = JSON.parse(JSON.stringify(activity)) as Prisma.InputJsonValue;
  const naturalId = String(activity.labelId ?? "").trim();
  const fallbackId = createHash("sha256")
    .update(JSON.stringify({
      date,
      startTime: activity.startTime,
      name: activity.name,
      mode: activity.mode,
      calorie: calorieRawNumber
    }))
    .digest("hex");
  return {
    externalId: naturalId || `generated-${fallbackId}`,
    date,
    name: typeof activity.name === "string" ? activity.name.slice(0, 200) : null,
    sportType: finiteInteger(activity.sportType),
    mode: finiteInteger(activity.mode),
    startTime: unixTime(activity.startTime),
    endTime: unixTime(activity.endTime),
    durationSeconds: finiteInteger(activity.totalTime ?? activity.workoutTime),
    calorieRaw: BigInt(calorieRawNumber),
    caloriesKcal: new Prisma.Decimal(calorieRawNumber).div(1000),
    rawPayload: rawJson
  };
}

async function fetchAllActivities(startDate: string, endDate: string) {
  const session = await loginToCoros();
  const activities: CorosActivity[] = [];
  let expected = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= MAX_PAGES && activities.length < expected; page += 1) {
    const result = await queryCorosActivities(session, {
      startDay: compactDate(startDate),
      endDay: compactDate(endDate),
      pageNumber: page,
      size: PAGE_SIZE
    });
    expected = result.count;
    activities.push(...result.dataList);
    if (!result.dataList.length) break;
  }
  if (activities.length < expected) {
    throw new Error(`COROS 活动分页未完整读取：${activities.length}/${expected}`);
  }
  return activities;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "COROS 同步失败").slice(0, 1000);
}

export async function syncCorosActivities(
  userId: number,
  options: { startDate?: string; endDate?: string } = {}
): Promise<CorosSyncResult> {
  const startDate = options.startDate ?? "2026-01-01";
  const endDate = options.endDate ?? "2026-12-31";
  compactDate(startDate);
  compactDate(endDate);
  if (endDate < startDate) throw new Error("结束日期不能早于开始日期");

  const batch = await prisma.coros_sync_batch.create({
    data: {
      user_id: BigInt(userId),
      start_date: dateValue(startDate),
      end_date: dateValue(endDate)
    }
  });

  try {
    const remote = await fetchAllActivities(startDate, endDate);
    const unique = new Map<string, NormalizedActivity>();
    for (const activity of remote) {
      const normalized = normalizeActivity(activity);
      unique.set(normalized.externalId, normalized);
    }
    const normalized = [...unique.values()];

    const result = await prisma.$transaction(async tx => {
      const existingDays = await tx.coros_daily_summary.findMany({
        where: {
          user_id: BigInt(userId),
          summary_date: { gte: dateValue(startDate), lte: dateValue(endDate) }
        },
        select: { summary_date: true }
      });

      for (const activity of normalized) {
        await tx.coros_activity.upsert({
          where: {
            user_id_external_id: {
              user_id: BigInt(userId),
              external_id: activity.externalId
            }
          },
          create: {
            user_id: BigInt(userId),
            sync_batch_id: batch.id,
            external_id: activity.externalId,
            activity_date: dateValue(activity.date),
            activity_name: activity.name,
            sport_type: activity.sportType,
            mode: activity.mode,
            start_time: activity.startTime,
            end_time: activity.endTime,
            duration_seconds: activity.durationSeconds,
            calorie_raw: activity.calorieRaw,
            calories_kcal: activity.caloriesKcal,
            raw_payload: activity.rawPayload
          },
          update: {
            sync_batch_id: batch.id,
            activity_date: dateValue(activity.date),
            activity_name: activity.name,
            sport_type: activity.sportType,
            mode: activity.mode,
            start_time: activity.startTime,
            end_time: activity.endTime,
            duration_seconds: activity.durationSeconds,
            calorie_raw: activity.calorieRaw,
            calories_kcal: activity.caloriesKcal,
            raw_payload: activity.rawPayload,
            deleted_at: null,
            updated_at: new Date()
          }
        });
      }

      const externalIds = normalized.map(activity => activity.externalId);
      await tx.coros_activity.updateMany({
        where: {
          user_id: BigInt(userId),
          activity_date: { gte: dateValue(startDate), lte: dateValue(endDate) },
          deleted_at: null,
          ...(externalIds.length ? { external_id: { notIn: externalIds } } : {})
        },
        data: { deleted_at: new Date(), updated_at: new Date() }
      });

      const summaries = new Map<string, { calorieRaw: bigint; activityCount: number }>();
      for (const activity of normalized) {
        const current = summaries.get(activity.date) ?? { calorieRaw: BigInt(0), activityCount: 0 };
        current.calorieRaw += activity.calorieRaw;
        current.activityCount += 1;
        summaries.set(activity.date, current);
      }
      for (const row of existingDays) {
        const date = row.summary_date.toISOString().slice(0, 10);
        if (!summaries.has(date)) summaries.set(date, { calorieRaw: BigInt(0), activityCount: 0 });
      }

      const profile = await tx.user_profile.findUnique({
        where: { user_id: BigInt(userId) },
        select: { user_id: true }
      });
      if (!profile) throw new Error("当前用户缺少身体资料，无法更新每日统计");

      const dailyResult: CorosSyncResult["days"] = [];
      const rawClient = new PrismaQueryClient(tx);
      for (const [date, summary] of [...summaries].sort(([a], [b]) => a.localeCompare(b))) {
        const calories = new Prisma.Decimal(summary.calorieRaw.toString()).div(1000).toDecimalPlaces(2);
        await tx.coros_daily_summary.upsert({
          where: {
            user_id_summary_date: {
              user_id: BigInt(userId),
              summary_date: dateValue(date)
            }
          },
          create: {
            user_id: BigInt(userId),
            sync_batch_id: batch.id,
            summary_date: dateValue(date),
            activity_count: summary.activityCount,
            calorie_raw: summary.calorieRaw,
            calories_kcal: calories
          },
          update: {
            sync_batch_id: batch.id,
            activity_count: summary.activityCount,
            calorie_raw: summary.calorieRaw,
            calories_kcal: calories,
            updated_at: new Date()
          }
        });
        const existingDaily = await tx.daily_record.findUnique({
          where: {
            user_id_record_date: {
              user_id: BigInt(userId),
              record_date: dateValue(date)
            }
          },
          select: { activity_calories: true, activity_source: true }
        });
        const preserveEffectiveActivity = Boolean(
          existingDaily
          && existingDaily.activity_source !== "coros"
          && Number(existingDaily.activity_calories) > 0
        );
        const daily = await tx.daily_record.upsert({
          where: {
            user_id_record_date: {
              user_id: BigInt(userId),
              record_date: dateValue(date)
            }
          },
          create: {
            user_id: BigInt(userId),
            record_date: dateValue(date),
            activity_calories: calories,
            coros_activity_calories: calories,
            activity_source: "coros"
          },
          update: {
            coros_activity_calories: calories,
            ...(!preserveEffectiveActivity ? {
              activity_calories: calories,
              activity_source: "coros"
            } : {}),
            deleted_at: null,
            updated_at: new Date()
          },
          select: { id: true }
        });
        await recalculateDailyRecord(rawClient, Number(daily.id));
        dailyResult.push({
          date,
          activityCount: summary.activityCount,
          caloriesKcal: Number(calories)
        });
      }

      await tx.coros_sync_batch.update({
        where: { id: batch.id },
        data: {
          status: "committed",
          activity_count: normalized.length,
          day_count: dailyResult.filter(day => day.activityCount > 0).length,
          completed_at: new Date()
        }
      });
      return dailyResult;
    }, { timeout: 60_000 });

    return {
      batchId: Number(batch.id),
      activityCount: normalized.length,
      dayCount: result.filter(day => day.activityCount > 0).length,
      days: result
    };
  } catch (error) {
    await prisma.coros_sync_batch.update({
      where: { id: batch.id },
      data: {
        status: "failed",
        error_message: errorMessage(error),
        completed_at: new Date()
      }
    }).catch(() => undefined);
    throw error;
  }
}
