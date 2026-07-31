import { NextResponse } from "next/server";
import { PrismaQueryClient, prisma } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
import { recalculateDailyRecord } from "@/lib/nutrition";
import { requireUser } from "@/lib/auth";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateValue(value: string) {
  if (!datePattern.test(value)) throw new ApiError(400, "日期格式无效");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "日期无效");
  }
  return date;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ date: string }> }
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { date } = await context.params;
    const recordDate = dateValue(date);
    const body = await readJson<{ activityCalories?: unknown }>(request);
    const activityCalories = positiveNumber(body.activityCalories, "全天活动消耗", true);

    const saved = await prisma.$transaction(async tx => {
      const [profile, existing, latestWeight] = await Promise.all([
        tx.user_profile.findUnique({
          where: { user_id: BigInt(user.id) },
          select: { initial_weight_kg: true }
        }),
        tx.daily_record.findUnique({
          where: {
            user_id_record_date: {
              user_id: BigInt(user.id),
              record_date: recordDate
            }
          },
          select: { id: true, weight_kg: true }
        }),
        tx.daily_record.findFirst({
          where: {
            user_id: BigInt(user.id),
            record_date: { lte: recordDate },
            weight_kg: { not: null },
            deleted_at: null
          },
          orderBy: { record_date: "desc" },
          select: { weight_kg: true }
        })
      ]);
      if (!profile) throw new ApiError(409, "请先在设置中完善身体资料");

      const fallbackWeight = latestWeight?.weight_kg ?? profile.initial_weight_kg;
      const daily = await tx.daily_record.upsert({
        where: {
          user_id_record_date: {
            user_id: BigInt(user.id),
            record_date: recordDate
          }
        },
        create: {
          user_id: BigInt(user.id),
          record_date: recordDate,
          weight_kg: fallbackWeight,
          activity_calories: activityCalories,
          activity_source: "manual"
        },
        update: {
          activity_calories: activityCalories,
          activity_source: "manual",
          deleted_at: null,
          updated_at: new Date(),
          ...(!existing?.weight_kg ? { weight_kg: fallbackWeight } : {})
        },
        select: { id: true }
      });

      await recalculateDailyRecord(new PrismaQueryClient(tx), Number(daily.id));
      return tx.daily_record.findUniqueOrThrow({
        where: { id: daily.id },
        select: {
          record_date: true,
          activity_calories: true,
          coros_activity_calories: true,
          activity_source: true,
          bmr: true,
          tef: true,
          tdee: true,
          calorie_balance: true
        }
      });
    });

    return NextResponse.json({
      date: saved.record_date.toISOString().slice(0, 10),
      activityCalories: Number(saved.activity_calories),
      corosActivityCalories: saved.coros_activity_calories === null
        ? null
        : Number(saved.coros_activity_calories),
      activitySource: saved.activity_source,
      bmr: Number(saved.bmr),
      tef: Number(saved.tef),
      tdee: Number(saved.tdee),
      calorieBalance: Number(saved.calorie_balance)
    });
  } catch (error) {
    return jsonError(error);
  }
}
