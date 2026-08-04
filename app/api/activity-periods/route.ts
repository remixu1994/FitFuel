import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/server/http";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateValue(value: unknown, field: string) {
  const text = String(value ?? "");
  if (!DATE_PATTERN.test(text)) throw new ApiError(400, `${field}格式无效`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, `${field}格式无效`);
  }
  return date;
}

function periodParams(url: string) {
  const params = new URL(url).searchParams;
  const start = dateValue(params.get("startDate"), "开始日期");
  const end = dateValue(params.get("endDate"), "结束日期");
  validatePeriod(start, end);
  return { start, end };
}

function validatePeriod(start: Date, end: Date) {
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 366) throw new ApiError(400, "统计周期必须在 1 至 366 天之间");
}

function responseValue(record: {
  period_start: Date;
  period_end: Date;
  active_calories_total: { toString(): string };
  source: string;
  note: string | null;
} | null) {
  if (!record) return null;
  return {
    startDate: record.period_start.toISOString().slice(0, 10),
    endDate: record.period_end.toISOString().slice(0, 10),
    activeCaloriesTotal: Number(record.active_calories_total.toString()),
    source: record.source,
    note: record.note
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { start, end } = periodParams(request.url);
    const record = await prisma.activity_period_total.findUnique({
      where: {
        user_id_period_start_period_end: {
          user_id: user.id,
          period_start: start,
          period_end: end
        }
      }
    });
    return NextResponse.json({ period: responseValue(record) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const start = dateValue(body.startDate, "开始日期");
    const end = dateValue(body.endDate, "结束日期");
    validatePeriod(start, end);
    const activeCaloriesTotal = Number(body.activeCaloriesTotal);
    if (!Number.isFinite(activeCaloriesTotal) || activeCaloriesTotal < 0 || activeCaloriesTotal > 1_000_000) {
      throw new ApiError(400, "周期活动消耗必须是 0 至 1,000,000 之间的数值");
    }
    const note = String(body.note ?? "").trim().slice(0, 500) || null;
    const record = await prisma.activity_period_total.upsert({
      where: {
        user_id_period_start_period_end: {
          user_id: user.id,
          period_start: start,
          period_end: end
        }
      },
      create: {
        user_id: user.id,
        period_start: start,
        period_end: end,
        active_calories_total: activeCaloriesTotal,
        note
      },
      update: {
        active_calories_total: activeCaloriesTotal,
        note,
        updated_at: new Date()
      }
    });
    return NextResponse.json({ period: responseValue(record) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { start, end } = periodParams(request.url);
    await prisma.activity_period_total.deleteMany({
      where: { user_id: user.id, period_start: start, period_end: end }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
