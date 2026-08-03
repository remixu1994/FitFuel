import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { mealLabel, mealOrder } from "@/lib/meal-types";
export const dynamic = "force-dynamic";

type MealItem = {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  dietaryFiber: number;
  source?: string;
  catalogExists?: boolean;
};

type Meal = {
  id: number;
  type: string;
  name: string;
  sortOrder: number;
  items: MealItem[];
};

type RecordDay = {
  date: string;
  recordId: number | null;
  weight: number | null;
  activityCalories: number;
  recordedCalories: number;
  mealCalories: number;
  manualCalories: number | null;
  importedCalories: number | null;
  elevatineCalories: number | null;
  caloriesSource: string;
  macroSource: string;
  elevatineCarbohydrate: number | null;
  elevatineProtein: number | null;
  elevatineFat: number | null;
  water: number;
  note: string | null;
  meals: Meal[];
};

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 7);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    const rangeSql = `
      (now() at time zone 'Asia/Shanghai')::date - ($2::int - 1)
    `;

    const [dateRows, mealRows] = await Promise.all([
      db.query(
        `with date_range as (
           select generate_series(
             ${rangeSql},
             (now() at time zone 'Asia/Shanghai')::date,
             interval '1 day'
           )::date as record_date
         ),
         water as (
           select (logged_at at time zone 'Asia/Shanghai')::date as record_date,
                  coalesce(sum(amount_ml), 0)::int as total
           from fitfuel.water_log
           where user_id=$1 and deleted_at is null
             and (logged_at at time zone 'Asia/Shanghai')::date >= ${rangeSql}
           group by 1
         )
         select to_char(r.record_date, 'YYYY-MM-DD') as date,
                d.id as record_id,d.weight_kg,d.activity_calories,
                d.calories_consumed,d.meal_calories,d.manual_calories,
                d.imported_calories,d.elevatine_calories,d.calories_source,d.macro_source,
                d.elevatine_carbohydrate,d.elevatine_protein,d.elevatine_fat,
                d.note,coalesce(w.total,0)::int as water
         from date_range r
         left join fitfuel.daily_record d
           on d.user_id=$1 and d.record_date=r.record_date and d.deleted_at is null
         left join water w on w.record_date=r.record_date
         order by r.record_date desc`,
        [user.id, days]
      ),
      db.query(
        `select to_char(d.record_date, 'YYYY-MM-DD') as date,
                m.id as meal_id,m.meal_type,m.display_name,m.sort_order,
                mi.id as item_id,mi.food_name_snapshot,mi.quantity,mi.unit,mi.source as item_source,
                mi.calories_snapshot,mi.protein_snapshot,mi.carbohydrate_snapshot,
                mi.fat_snapshot,mi.dietary_fiber_snapshot,
                exists(select 1 from food_info.food f where f.status=1 and lower(f.name)=lower(mi.food_name_snapshot)) as catalog_exists
         from fitfuel.daily_record d
         join fitfuel.meal m
           on m.daily_record_id=d.id and m.deleted_at is null
         left join fitfuel.meal_item mi
           on mi.meal_id=m.id and mi.deleted_at is null
         where d.user_id=$1 and d.deleted_at is null
           and d.record_date >= ${rangeSql}
         order by d.record_date desc,m.sort_order,mi.created_at`,
        [user.id, days]
      )
    ]);

    const records: RecordDay[] = dateRows.rows.map(raw => {
      const row = numbers(raw);
      return {
        date: row.date,
        recordId: row.record_id ?? null,
        weight: row.weight_kg ?? null,
        activityCalories: Number(row.activity_calories ?? 0),
        recordedCalories: Number(row.calories_consumed ?? 0),
        mealCalories: Number(row.meal_calories ?? 0),
        manualCalories: row.manual_calories === null || row.manual_calories === undefined ? null : Number(row.manual_calories),
        importedCalories: row.imported_calories === null || row.imported_calories === undefined ? null : Number(row.imported_calories),
        elevatineCalories: row.elevatine_calories === null || row.elevatine_calories === undefined ? null : Number(row.elevatine_calories),
        caloriesSource: row.calories_source ?? "manual",
        macroSource: row.macro_source ?? "meals",
        elevatineCarbohydrate: row.elevatine_carbohydrate == null ? null : Number(row.elevatine_carbohydrate),
        elevatineProtein: row.elevatine_protein == null ? null : Number(row.elevatine_protein),
        elevatineFat: row.elevatine_fat == null ? null : Number(row.elevatine_fat),
        water: Number(row.water ?? 0),
        note: row.note ?? null,
        meals: []
      };
    });
    const byDate = new Map(records.map(day => [day.date, day]));
    const meals = new Map<string, Meal>();

    for (const raw of mealRows.rows) {
      const row = numbers(raw);
      const day = byDate.get(row.date);
      if (!day) continue;
      const order = mealOrder(String(row.meal_type)) ?? Number(row.sort_order);
      const mealKey = `${row.date}:${order || row.meal_id}`;
      let meal = meals.get(mealKey);
      if (!meal) {
        meal = {
          id: Number(row.meal_id),
          type: `meal_${order || row.sort_order}`,
          name: order ? mealLabel(order) : row.display_name,
          sortOrder: order || Number(row.sort_order),
          items: []
        };
        meals.set(mealKey, meal);
        day.meals.push(meal);
      }
      if (row.item_id) {
        meal.items.push({
          id: Number(row.item_id),
          name: row.food_name_snapshot,
          source: row.item_source,
          catalogExists: row.catalog_exists,
          quantity: Number(row.quantity),
          unit: row.unit,
          calories: Number(row.calories_snapshot),
          protein: Number(row.protein_snapshot),
          carbohydrate: Number(row.carbohydrate_snapshot),
          fat: Number(row.fat_snapshot),
          dietaryFiber: Number(row.dietary_fiber_snapshot)
        });
      }
    }

    return NextResponse.json({
      range: `${days}d`,
      records: records.map(day => {
        const items = day.meals.flatMap(meal => meal.items);
        const sum = (key: keyof Pick<MealItem, "calories" | "protein" | "carbohydrate" | "fat" | "dietaryFiber">) =>
          items.reduce((total, item) => total + item[key], 0);
        return {
          ...day,
          totals: {
            calories: day.recordedCalories,
            protein: day.macroSource === "elevatine" && day.elevatineProtein !== null ? day.elevatineProtein : sum("protein"),
            carbohydrate: day.macroSource === "elevatine" && day.elevatineCarbohydrate !== null ? day.elevatineCarbohydrate : sum("carbohydrate"),
            fat: day.macroSource === "elevatine" && day.elevatineFat !== null ? day.elevatineFat : sum("fat"),
            dietaryFiber: sum("dietaryFiber")
          }
        };
      })
    });
  } catch (error) {
    return jsonError(error);
  }
}
