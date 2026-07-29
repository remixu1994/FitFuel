import type { PrismaQueryClient } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { recalculateDailyRecord } from "@/lib/nutrition";

export const mealNames: Record<string, [string, number]> = {
  breakfast: ["早餐", 1],
  lunch: ["午餐", 2],
  dinner: ["晚餐", 3],
  snack: ["加餐", 4]
};

export type MealFood = {
  id?: number;
  name: string;
  serving: string;
  gram_weight: number;
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  dietary_fiber: number;
};

export async function addFoodToMeal(
  client: PrismaQueryClient,
  input: {
    userId: number;
    date: string;
    mealType: string;
    quantity: number;
    food: MealFood;
    foodId?: number | null;
    customFoodId?: number | null;
    source: "database" | "user" | "ai";
  }
) {
  const config = mealNames[input.mealType];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !config) {
    throw new ApiError(400, "餐次或日期无效");
  }
  const record = await client.query(
    `insert into fitfuel.daily_record(user_id,record_date)
     values($1,$2::date) on conflict(user_id,record_date) do update set deleted_at=null
     returning id`,
    [input.userId, input.date]
  );
  const dailyId = Number(record.rows[0].id);
  let meal = await client.query(
    `select id from fitfuel.meal
     where daily_record_id=$1 and meal_type=$2 and deleted_at is null limit 1`,
    [dailyId, input.mealType]
  );
  if (!meal.rowCount) {
    meal = await client.query(
      `insert into fitfuel.meal(daily_record_id,meal_type,display_name,sort_order)
       values($1,$2,$3,$4) returning id`,
      [dailyId, input.mealType, config[0], config[1]]
    );
  }
  const food = input.food;
  const quantity = input.quantity;
  const inserted = await client.query(
    `insert into fitfuel.meal_item
     (meal_id,food_id,custom_food_id,food_name_snapshot,quantity,unit,gram_weight,
      calories_snapshot,protein_snapshot,carbohydrate_snapshot,fat_snapshot,dietary_fiber_snapshot,source)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [
      meal.rows[0].id,
      input.foodId ?? null,
      input.customFoodId ?? null,
      food.name,
      quantity,
      food.serving,
      Number(food.gram_weight) * quantity,
      Number(food.calories) * quantity,
      Number(food.protein) * quantity,
      Number(food.carbohydrate) * quantity,
      Number(food.fat) * quantity,
      Number(food.dietary_fiber) * quantity,
      input.source
    ]
  );
  await recalculateDailyRecord(client, dailyId);
  return Number(inserted.rows[0].id);
}
