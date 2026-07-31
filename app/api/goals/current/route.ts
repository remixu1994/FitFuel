import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await db.query(
      `select id, goal_type, calories_kcal, protein_g, carbohydrate_g, fat_g, water_ml
       from fitfuel.nutrition_goal
       where user_id=$1 and effective_to is null order by effective_from desc limit 1`,
      [user.id]
    );
    return NextResponse.json({ goal: result.rowCount ? numbers(result.rows[0]) : null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const goalType = String(body.goalType);
    const calories = positiveNumber(body.calories, "热量");
    const protein = positiveNumber(body.protein, "蛋白质", true);
    const carbs = positiveNumber(body.carbs, "碳水", true);
    const fat = positiveNumber(body.fat, "脂肪", true);
    const water = positiveNumber(body.water, "饮水目标");
    await db.query(
      `update fitfuel.nutrition_goal set goal_type=$2, calories_kcal=$3, protein_g=$4,
       carbohydrate_g=$5, fat_g=$6, water_ml=$7
       where user_id=$1 and effective_to is null`,
      [user.id, goalType, calories, protein, carbs, fat, water]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
