import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { ApiError, jsonError } from "@/server/http";
import { calculateMetabolism } from "@/shared/domain/nutrition";
export const dynamic = "force-dynamic";

const ranges = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "2026": 365
} as const;

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, `${label}格式无效`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || dateOnly(date) !== value) throw new ApiError(400, `${label}无效`);
  return date;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const searchParams = new URL(request.url).searchParams;
    const presetRange = searchParams.get("range") ?? "30d";
    const requestedStart = searchParams.get("startDate");
    const requestedEnd = searchParams.get("endDate");
    if (Boolean(requestedStart) !== Boolean(requestedEnd)) throw new ApiError(400, "开始和结束日期必须同时提供");
    if (!requestedStart && !(presetRange in ranges)) throw new ApiError(400, "运动数据范围无效");

    const [latestCoros, latestDaily] = await Promise.all([
      prisma.coros_daily_summary.findFirst({
        where: { user_id: BigInt(user.id), activity_count: { gt: 0 } },
        orderBy: { summary_date: "desc" },
        select: { summary_date: true }
      }),
      prisma.daily_record.findFirst({
        where: { user_id: BigInt(user.id), deleted_at: null },
        orderBy: { record_date: "desc" },
        select: { record_date: true }
      })
    ]);
    const latestDates = [latestCoros?.summary_date, latestDaily?.record_date].filter((date): date is Date => Boolean(date));
    const latestEndDate = latestDates.length
      ? new Date(Math.max(...latestDates.map(date => date.getTime())))
      : new Date("2026-12-31T00:00:00.000Z");
    const endDate = requestedEnd ? parseDate(requestedEnd, "结束日期") : latestEndDate;
    const startDate = requestedStart
      ? parseDate(requestedStart, "开始日期")
      : presetRange === "2026"
        ? new Date("2026-01-01T00:00:00.000Z")
        : addDays(endDate, -(ranges[presetRange as keyof typeof ranges] - 1));
    if (startDate > endDate) throw new ApiError(400, "开始日期不能晚于结束日期");
    const range = requestedStart ? "custom" : presetRange;
    const calendarMonth = searchParams.get("month") ?? dateOnly(endDate).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(calendarMonth)) throw new ApiError(400, "日历月份格式无效");
    const calendarStart = new Date(`${calendarMonth}-01T00:00:00.000Z`);
    if (Number.isNaN(calendarStart.valueOf()) || dateOnly(calendarStart).slice(0, 7) !== calendarMonth) {
      throw new ApiError(400, "日历月份无效");
    }
    const calendarEnd = addDays(new Date(Date.UTC(
      calendarStart.getUTCFullYear(),
      calendarStart.getUTCMonth() + 1,
      1
    )), -1);

    const [summaries, batch, dailyRecords, profile, latestWeight, calendarRecords] = await Promise.all([
      prisma.coros_daily_summary.findMany({
        where: {
          user_id: BigInt(user.id),
          summary_date: { gte: startDate, lte: endDate },
          activity_count: { gt: 0 }
        },
        orderBy: { summary_date: "asc" }
      }),
      prisma.coros_sync_batch.findFirst({
        where: { user_id: BigInt(user.id), status: "committed" },
        orderBy: { completed_at: "desc" }
      }),
      prisma.daily_record.findMany({
        where: {
          user_id: BigInt(user.id),
          record_date: { gte: startDate, lte: endDate },
          deleted_at: null
        },
        orderBy: { record_date: "asc" },
        select: {
          weight_kg: true,
          calories_consumed: true,
          activity_calories: true,
          bmr: true,
          tef: true,
          tdee: true,
          calorie_balance: true,
          activity_source: true
        }
      }),
      prisma.user_profile.findUnique({
        where: { user_id: BigInt(user.id) },
        select: { height_cm: true, age: true, gender: true, initial_weight_kg: true }
      }),
      prisma.daily_record.findFirst({
        where: {
          user_id: BigInt(user.id),
          record_date: { lte: endDate },
          weight_kg: { not: null },
          deleted_at: null
        },
        orderBy: { record_date: "desc" },
        select: { weight_kg: true }
      }),
      prisma.daily_record.findMany({
        where: {
          user_id: BigInt(user.id),
          record_date: { gte: calendarStart, lte: calendarEnd },
          deleted_at: null
        },
        orderBy: { record_date: "asc" },
        select: {
          record_date: true,
          activity_calories: true,
          coros_activity_calories: true,
          activity_source: true,
          tdee: true
        }
      })
    ]);

    const totalCalories = summaries.reduce((sum, day) => sum + Number(day.calories_kcal), 0);
    const activityCount = summaries.reduce((sum, day) => sum + day.activity_count, 0);
    const peak = summaries.reduce(
      (best, day) => Number(day.calories_kcal) > best.calories
        ? { date: dateOnly(day.summary_date), calories: Number(day.calories_kcal) }
        : best,
      { date: null as string | null, calories: 0 }
    );
    const fallbackWeight = Number(latestWeight?.weight_kg ?? profile?.initial_weight_kg ?? 0);
    const energyRecords = dailyRecords.map(record => {
      const intake = record.calories_consumed;
      const activeCalories = Number(record.activity_calories);
      const weight = Number(record.weight_kg ?? fallbackWeight);
      const calculated = profile && weight > 0
        ? calculateMetabolism(weight, intake, activeCalories, {
            height: Number(profile.height_cm),
            age: profile.age,
            gender: profile.gender === "female" ? "female" : profile.gender === "other" ? "other" : "male"
          })
        : null;
      const storedBmr = Number(record.bmr);
      const storedTdee = Number(record.tdee);
      const hasCompleteSnapshot = storedBmr > 0 && storedTdee >= storedBmr;
      const bmr = hasCompleteSnapshot ? storedBmr : calculated?.bmr ?? storedBmr;
      const tef = hasCompleteSnapshot ? Number(record.tef) : calculated?.tef ?? intake * 0.08;
      const tdee = hasCompleteSnapshot ? storedTdee : calculated?.tdee ?? bmr + activeCalories + tef;
      const deficit = hasCompleteSnapshot
        ? Number(record.calorie_balance)
        : calculated?.calorieBalance ?? tdee - intake;
      return { bmr, tef, activeCalories, tdee, intake, deficit, activity_source: record.activity_source };
    }).filter(record => record.bmr > 0 && record.tdee > 0);
    const energyTotals = energyRecords.reduce(
      (total, record) => ({
        bmr: total.bmr + record.bmr,
        tef: total.tef + record.tef,
        activeCalories: total.activeCalories + record.activeCalories,
        tdee: total.tdee + record.tdee,
        intake: total.intake + record.intake,
        deficit: total.deficit + record.deficit
      }),
      { bmr: 0, tef: 0, activeCalories: 0, tdee: 0, intake: 0, deficit: 0 }
    );
    const recordedDays = energyRecords.length;
    const round = (value: number) => Math.round(value * 100) / 100;
    const average = (value: number) => recordedDays ? round(value / recordedDays) : 0;
    const activitySources = energyRecords.reduce<Record<string, number>>((sources, record) => {
      sources[record.activity_source] = (sources[record.activity_source] ?? 0) + 1;
      return sources;
    }, {});

    return NextResponse.json({
      range,
      startDate: dateOnly(startDate),
      endDate: dateOnly(endDate),
      canSync: user.role === "admin",
      connection: {
        configured: Boolean(process.env.COROS_ACCOUNT && process.env.COROS_PASSWORD),
        lastSyncAt: batch?.completed_at?.toISOString() ?? null,
        lastBatchActivityCount: batch?.activity_count ?? 0
      },
      summary: {
        totalCalories: Math.round(totalCalories * 100) / 100,
        activeDays: summaries.length,
        activityCount,
        averagePerActiveDay: summaries.length
          ? Math.round(totalCalories / summaries.length * 100) / 100
          : 0,
        peak
      },
      energy: {
        recordedDays,
        periodDays: Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
        averages: {
          bmr: average(energyTotals.bmr),
          tef: average(energyTotals.tef),
          activeCalories: average(energyTotals.activeCalories),
          tdee: average(energyTotals.tdee),
          intake: average(energyTotals.intake),
          deficit: average(energyTotals.deficit)
        },
        totals: {
          bmr: round(energyTotals.bmr),
          tef: round(energyTotals.tef),
          activeCalories: round(energyTotals.activeCalories),
          tdee: round(energyTotals.tdee),
          intake: round(energyTotals.intake),
          deficit: round(energyTotals.deficit)
        },
        activitySources
      },
      calendar: {
        month: calendarMonth,
        days: calendarRecords.map(record => ({
          date: dateOnly(record.record_date),
          activityCalories: Number(record.activity_calories),
          corosActivityCalories: record.coros_activity_calories === null
            ? null
            : Number(record.coros_activity_calories),
          source: record.activity_source,
          tdee: Number(record.tdee)
        }))
      },
      days: summaries.map(day => ({
        date: dateOnly(day.summary_date),
        activityCount: day.activity_count,
        caloriesKcal: Number(day.calories_kcal)
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}
