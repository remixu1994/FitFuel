import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/server/http";
import { transaction } from "@/server/db";
import { mealOrder } from "@/shared/domain/meal-types";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ date?: string; mealType?: string }>(request);
    const date = String(body.date ?? "");
    const order = mealOrder(String(body.mealType ?? ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !order) throw new ApiError(400, "餐次或日期无效");
    const result = await transaction(async client => {
      const profile = await client.query(`select meal_count from fitfuel.user_profile where user_id=$1`, [user.id]);
      const configured = Number(profile.rows[0]?.meal_count ?? 3);
      if (order !== configured) throw new ApiError(400, "请先移除最后一个空餐次");
      const meal = await client.query(
        `select m.id from fitfuel.meal m join fitfuel.daily_record d on d.id=m.daily_record_id
         where d.user_id=$1 and d.record_date=$2::date and m.sort_order in ($3,$4) and m.deleted_at is null limit 1`,
        [user.id, date, order, order * 10]
      );
      if (meal.rowCount) {
        const items = await client.query(`select 1 from fitfuel.meal_item where meal_id=$1 and deleted_at is null limit 1`, [meal.rows[0].id]);
        if (items.rowCount) throw new ApiError(409, "餐次内已有食物，移除食物后才能删除餐次");
        await client.query(`update fitfuel.meal set deleted_at=now() where id=$1`, [meal.rows[0].id]);
      }
      await client.query(`update fitfuel.user_profile set meal_count=$2,updated_at=now() where user_id=$1`, [user.id, Math.max(1, configured - 1)]);
      return Math.max(1, configured - 1);
    });
    return NextResponse.json({ ok: true, mealCount: result });
  } catch (error) { return jsonError(error); }
}
