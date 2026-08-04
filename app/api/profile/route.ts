import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { db, numbers } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/server/http";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await db.query(
      `select u.email, u.display_name, p.height_cm, p.age, p.gender,
              p.initial_weight_kg, p.target_weight_kg, p.activity_level, p.meal_count, p.timezone
       from fitfuel.app_user u join fitfuel.user_profile p on p.user_id = u.id
       where u.id = $1`,
      [user.id]
    );
    return NextResponse.json({ profile: numbers(result.rows[0]) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) throw new ApiError(400, "昵称不能为空");
    const height = positiveNumber(body.height, "身高");
    const age = positiveNumber(body.age, "年龄");
    const initialWeight = positiveNumber(body.initialWeight, "初始体重");
    const targetWeight = positiveNumber(body.targetWeight, "目标体重");
    const requestedMealCount = Number(body.mealCount ?? 3);
    if (!Number.isFinite(requestedMealCount)) throw new ApiError(400, "每日餐次数无效");
    const mealCount = Math.max(1, Math.min(12, Math.floor(requestedMealCount)));
    if (mealCount < 12) {
      const occupied = await db.query(
        `select 1 from fitfuel.meal_item mi join fitfuel.meal m on m.id=mi.meal_id
         join fitfuel.daily_record d on d.id=m.daily_record_id
         where d.user_id=$1 and (case when m.meal_type like 'elevatine_%' then m.sort_order/10 else m.sort_order end)>$2
           and m.deleted_at is null and mi.deleted_at is null limit 1`,
        [user.id, mealCount]
      );
      if (occupied.rowCount) throw new ApiError(409, "减少餐次数前，请先移除超出范围餐次中的食物");
      await db.query(
        `update fitfuel.meal m set deleted_at=now()
         from fitfuel.daily_record d
         where m.daily_record_id=d.id and d.user_id=$1
           and (case when m.meal_type like 'elevatine_%' then m.sort_order/10 else m.sort_order end)>$2
           and m.deleted_at is null`,
        [user.id, mealCount]
      );
    }
    const gender = String(body.gender);
    if (!["male", "female", "other"].includes(gender)) throw new ApiError(400, "性别无效");
    await db.query("update fitfuel.app_user set display_name=$2, updated_at=now() where id=$1", [user.id, displayName]);
    await db.query(
      `update fitfuel.user_profile set height_cm=$2, age=$3, gender=$4,
       initial_weight_kg=$5, target_weight_kg=$6, meal_count=$7, updated_at=now() where user_id=$1`,
      [user.id, height, age, gender, initialWeight, targetWeight, mealCount]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
