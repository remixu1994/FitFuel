import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { transaction } from "@/server/db";
import { addFoodToMeal, type MealFood } from "@/server/meals";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/server/http";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{
      date?: string;
      mealType?: string;
      foodKey?: string;
      quantity?: number;
    }>(request);
    const date = String(body.date ?? "");
    const mealType = String(body.mealType ?? "");
    const quantity = positiveNumber(body.quantity ?? 1, "数量");
    const [source, rawId] = String(body.foodKey ?? "").split(":");
    const foodId = Number(rawId);
    if (!["shared", "custom"].includes(source) || !Number.isInteger(foodId)) {
      throw new ApiError(400, "食品无效");
    }

    const itemId = await transaction(async client => {
      const result = source === "shared"
        ? await client.query<MealFood & { id: number }>(
          `select f.id,f.name,coalesce(s.serving_name,n.unit,'100g') serving,
                  coalesce(s.gram_weight,100) gram_weight,coalesce(n.calories,0) calories,
                  coalesce(n.protein,0) protein,coalesce(n.carbohydrate,0) carbohydrate,
                  coalesce(n.fat,0) fat,coalesce(n.dietary_fiber,0) dietary_fiber
           from food_info.food f
           left join lateral (
             select * from food_info.food_nutrition where food_id=f.id order by id limit 1
           ) n on true
           left join lateral (
             select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1
           ) s on true
           where f.id=$1 and f.status=1`,
          [foodId]
        )
        : await client.query<MealFood & { id: number }>(
          `select id,name,serving_name serving,gram_weight,calories,protein,
                  carbohydrate,fat,dietary_fiber
           from fitfuel.custom_food
           where id=$1 and user_id=$2 and deleted_at is null`,
          [foodId, user.id]
        );
      if (!result.rowCount) throw new ApiError(404, "食品不存在");
      return addFoodToMeal(client, {
        userId: user.id,
        date,
        mealType,
        quantity,
        food: result.rows[0],
        foodId: source === "shared" ? foodId : null,
        customFoodId: source === "custom" ? foodId : null,
        source: source === "shared" ? "database" : "user"
      });
    });
    return NextResponse.json({ id: itemId }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
