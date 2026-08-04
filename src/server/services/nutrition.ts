import type { PrismaQueryClient } from "@/server/db";
import { calculateMetabolism } from "@/shared/domain/nutrition";

export async function recalculateDailyRecord(client: PrismaQueryClient, dailyRecordId: number) {
  const recordResult = await client.query(
    `select d.id, d.user_id, d.weight_kg, d.activity_calories,
            d.calories_source, d.manual_calories, d.imported_calories, d.elevatine_calories,
            p.height_cm, p.age, p.gender
     from fitfuel.daily_record d
     join fitfuel.user_profile p on p.user_id = d.user_id
     where d.id = $1 and d.deleted_at is null
     for update`,
    [dailyRecordId]
  );
  if (!recordResult.rowCount) return;
  const record = recordResult.rows[0];
  const totals = await client.query(
    `select coalesce(sum(mi.calories_snapshot), 0) as calories
     from fitfuel.meal m
     join fitfuel.meal_item mi on mi.meal_id = m.id and mi.deleted_at is null
     where m.daily_record_id = $1 and m.deleted_at is null`,
    [dailyRecordId]
  );
  const mealCalories = Math.round(Number(totals.rows[0].calories));
  const intake = record.calories_source === "elevatine" && record.elevatine_calories !== null
    ? Number(record.elevatine_calories)
    : record.calories_source === "import" && record.imported_calories !== null
    ? Number(record.imported_calories)
    : record.calories_source === "manual" && record.manual_calories !== null
      ? Number(record.manual_calories)
      : mealCalories;
  const weight = Number(record.weight_kg || 0);
  const values = weight > 0
    ? calculateMetabolism(weight, intake, Number(record.activity_calories), {
        height: Number(record.height_cm),
        age: Number(record.age),
        gender: record.gender
      })
    : { bmr: 0, tef: intake * .08, tdee: Number(record.activity_calories) + intake * .08, calorieBalance: Number(record.activity_calories) - intake * .92 };
  await client.query(
    `update fitfuel.daily_record
     set meal_calories = $2, calories_consumed = $3, bmr = $4, tef = $5,
         tdee = $6, calorie_balance = $7, updated_at = now()
     where id = $1`,
    [dailyRecordId, mealCalories, Math.round(intake), values.bmr, values.tef, values.tdee, values.calorieBalance]
  );
}
