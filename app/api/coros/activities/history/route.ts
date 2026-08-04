import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { ApiError, jsonError } from "@/server/http";
export const dynamic = "force-dynamic";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, `${label}格式无效`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || dateOnly(date) !== value) throw new ApiError(400, `${label}无效`);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const requestedStart = params.get("startDate");
    const requestedEnd = params.get("endDate");
    if (Boolean(requestedStart) !== Boolean(requestedEnd)) throw new ApiError(400, "开始和结束日期必须同时提供");
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(5, Number.parseInt(params.get("pageSize") ?? "10", 10) || 10));

    const latest = await prisma.coros_activity.findFirst({
      where: { user_id: BigInt(user.id), deleted_at: null },
      orderBy: { activity_date: "desc" },
      select: { activity_date: true }
    });
    const endDate = requestedEnd
      ? parseDate(requestedEnd, "结束日期")
      : latest?.activity_date ?? new Date();
    const startDate = requestedStart
      ? parseDate(requestedStart, "开始日期")
      : addDays(endDate, -29);
    if (startDate > endDate) throw new ApiError(400, "开始日期不能晚于结束日期");

    const where = {
      user_id: BigInt(user.id),
      activity_date: { gte: startDate, lte: endDate },
      deleted_at: null
    };
    const [total, aggregate, activities] = await Promise.all([
      prisma.coros_activity.count({ where }),
      prisma.coros_activity.aggregate({ where, _sum: { calories_kcal: true, duration_seconds: true } }),
      prisma.coros_activity.findMany({
        where,
        orderBy: [{ activity_date: "desc" }, { start_time: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          external_id: true,
          activity_date: true,
          activity_name: true,
          sport_type: true,
          mode: true,
          start_time: true,
          duration_seconds: true,
          calories_kcal: true
        }
      })
    ]);

    return NextResponse.json({
      startDate: dateOnly(startDate),
      endDate: dateOnly(endDate),
      summary: {
        activityCount: total,
        totalCalories: Number(aggregate._sum.calories_kcal ?? 0),
        totalDurationSeconds: aggregate._sum.duration_seconds ?? 0
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      },
      activities: activities.map(activity => ({
        id: activity.external_id,
        date: dateOnly(activity.activity_date),
        name: activity.activity_name || "未命名运动",
        sportType: activity.sport_type,
        mode: activity.mode,
        startTime: activity.start_time?.toISOString() ?? null,
        durationSeconds: activity.duration_seconds,
        caloriesKcal: Number(activity.calories_kcal)
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}
