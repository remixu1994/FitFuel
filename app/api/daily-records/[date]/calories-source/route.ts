import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/lib/http";
import { calculateMetabolism } from "@/lib/nutrition";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { date } = await context.params;
    if (!datePattern.test(date)) throw new ApiError(400, "日期格式无效");
    const body = await readJson<{ source?: string }>(request);
    if (!["meals", "manual", "import", "elevatine"].includes(String(body.source))) throw new ApiError(400, "摄入来源无效");
    const source = body.source as "meals" | "manual" | "import" | "elevatine";
    const recordDate = new Date(`${date}T00:00:00.000Z`);
    const [record, profile] = await Promise.all([
      prisma.daily_record.findUnique({
        where: { user_id_record_date: { user_id: BigInt(user.id), record_date: recordDate } }
      }),
      prisma.user_profile.findUnique({ where: { user_id: BigInt(user.id) } })
    ]);
    if (!record || record.deleted_at) throw new ApiError(404, "每日记录不存在");
    if (!profile || !record.weight_kg) throw new ApiError(400, "请先完善个人资料和体重");
    const calories = source === "elevatine" ? record.elevatine_calories
      : source === "meals" ? record.meal_calories
      : source === "manual" ? record.manual_calories
        : record.imported_calories;
    if (calories === null || calories === undefined || (source === "meals" && calories <= 0)) {
      throw new ApiError(400, "该来源没有可用的摄入数据");
    }
    const values = calculateMetabolism(Number(record.weight_kg), calories, Number(record.activity_calories), {
      height: Number(profile.height_cm),
      age: profile.age,
      gender: profile.gender as "male" | "female" | "other"
    });
    const updated = await prisma.daily_record.update({
      where: { id: record.id },
      data: {
        calories_source: source,
        calories_consumed: calories,
        macro_source: source === "elevatine" ? "elevatine" : record.macro_source,
        bmr: values.bmr,
        tef: values.tef,
        tdee: values.tdee,
        calorie_balance: values.calorieBalance,
        updated_at: new Date()
      }
    });
    return NextResponse.json({
      record: {
        date,
        calories: updated.calories_consumed,
        source: updated.calories_source,
        bmr: Number(updated.bmr),
        tef: Number(updated.tef),
        tdee: Number(updated.tdee),
        calorieBalance: Number(updated.calorie_balance)
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
