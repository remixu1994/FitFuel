import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
import { calculateMetabolism } from "@/lib/nutrition";
export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_: Request, context: { params: Promise<{ date: string }> }) {
  try {
    const user = await requireUser();
    const { date } = await context.params;
    if (!datePattern.test(date)) throw new ApiError(400, "日期格式无效");
    const [record, goal, profile, meals, water] = await Promise.all([
      db.query(
        `select id,record_date,weight_kg,calories_consumed,meal_calories,manual_calories,
                imported_calories,activity_calories,coros_activity_calories,activity_source,bmr,tef,tdee,
                calorie_balance,note,calories_source,macro_source,elevatine_calories,
                elevatine_carbohydrate,elevatine_protein,elevatine_fat,elevatine_batch_id
         from fitfuel.daily_record where user_id=$1 and record_date=$2::date and deleted_at is null`,
        [user.id, date]
      ),
      db.query(
        `select calories_kcal,protein_g,carbohydrate_g,fat_g,water_ml
         from fitfuel.nutrition_goal where user_id=$1 and effective_to is null limit 1`,
        [user.id]
      ),
      db.query(
        `select initial_weight_kg,target_weight_kg,height_cm,age,gender
         from fitfuel.user_profile where user_id=$1`,
        [user.id]
      ),
      db.query(
        `select m.id as meal_id,m.meal_type,m.display_name,m.sort_order,m.source,
                mi.id as item_id,mi.food_name_snapshot,mi.quantity,mi.unit,
                mi.gram_weight,mi.source as item_source,
                mi.calories_snapshot,mi.protein_snapshot,mi.carbohydrate_snapshot,
                mi.fat_snapshot,mi.dietary_fiber_snapshot
         from fitfuel.meal m
         join fitfuel.daily_record d on d.id=m.daily_record_id
         left join fitfuel.meal_item mi on mi.meal_id=m.id and mi.deleted_at is null
         where d.user_id=$1 and d.record_date=$2::date and d.deleted_at is null and m.deleted_at is null
         order by m.sort_order,mi.created_at`,
        [user.id, date]
      ),
      db.query(
        `select coalesce(sum(amount_ml),0)::int as total
         from fitfuel.water_log
         where user_id=$1 and deleted_at is null
           and (logged_at at time zone 'Asia/Shanghai')::date=$2::date`,
        [user.id, date]
      )
    ]);
    const grouped = new Map<number, Record<string, unknown>>();
    for (const raw of meals.rows) {
      const row = numbers(raw);
      if (!grouped.has(row.meal_id)) grouped.set(row.meal_id, {
        id: row.meal_id, type: row.meal_type, name: row.display_name,
        sortOrder: row.sort_order, source: row.source, items: []
      });
      if (row.item_id) (grouped.get(row.meal_id)!.items as unknown[]).push({
        id: row.item_id, name: row.food_name_snapshot, quantity: row.quantity, unit: row.unit,
        gramWeight: row.gram_weight, source: row.item_source,
        calories: row.calories_snapshot, protein: row.protein_snapshot,
        carbohydrate: row.carbohydrate_snapshot, fat: row.fat_snapshot,
        dietaryFiber: row.dietary_fiber_snapshot
      });
    }
    return NextResponse.json({
      record: record.rowCount ? numbers(record.rows[0]) : null,
      goal: goal.rowCount ? numbers(goal.rows[0]) : null,
      profile: profile.rowCount ? numbers(profile.rows[0]) : null,
      meals: [...grouped.values()],
      water: water.rows[0].total
    });
  } catch (error) { return jsonError(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { date } = await context.params;
    if (!datePattern.test(date)) throw new ApiError(400, "日期格式无效");
    const body = await readJson<Record<string, unknown>>(request);
    const weight = positiveNumber(body.weight, "体重");
    const activity = positiveNumber(body.activityCalories ?? 0, "活动消耗", true);
    const intake = positiveNumber(body.caloriesConsumed ?? 0, "摄入热量", true);
    const profileResult = await db.query(
      "select height_cm,age,gender from fitfuel.user_profile where user_id=$1",
      [user.id]
    );
    const profile = profileResult.rows[0];
    const values = calculateMetabolism(weight, intake, activity, {
      height: Number(profile.height_cm), age: Number(profile.age), gender: profile.gender
    });
    const result = await db.query(
      `insert into fitfuel.daily_record
       (user_id,record_date,weight_kg,calories_consumed,manual_calories,activity_calories,
        bmr,tef,tdee,calorie_balance,note,calories_source)
       values ($1,$2::date,$3,$4,$4,$5,$6,$7,$8,$9,$10,'manual')
       on conflict (user_id,record_date) do update set
         weight_kg=excluded.weight_kg,calories_consumed=excluded.calories_consumed,
         manual_calories=excluded.manual_calories,
         activity_calories=excluded.activity_calories,bmr=excluded.bmr,tef=excluded.tef,
         tdee=excluded.tdee,calorie_balance=excluded.calorie_balance,note=excluded.note,
         calories_source='manual',deleted_at=null,updated_at=now()
       returning id`,
      [user.id,date,weight,Math.round(intake),Math.round(activity),values.bmr,values.tef,
       values.tdee,values.calorieBalance,String(body.note ?? "") || null]
    );
    return NextResponse.json({ id: Number(result.rows[0].id), ...values });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { date } = await context.params;
    const result = await db.query(
      "update fitfuel.daily_record set deleted_at=now(),updated_at=now() where user_id=$1 and record_date=$2::date and deleted_at is null",
      [user.id,date]
    );
    if (!result.rowCount) throw new ApiError(404,"记录不存在");
    return NextResponse.json({ok:true});
  } catch (error) { return jsonError(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { date } = await context.params;
    if (!datePattern.test(date)) throw new ApiError(400, "日期格式无效");
    const body = await readJson<Record<string, unknown>>(request);
    const weight = positiveNumber(body.weight, "体重");
    const [existing, profileResult] = await Promise.all([
      db.query(
        `select id, calories_consumed, activity_calories
         from fitfuel.daily_record where user_id=$1 and record_date=$2::date`,
        [user.id, date]
      ),
      db.query(
        "select height_cm,age,gender from fitfuel.user_profile where user_id=$1",
        [user.id]
      )
    ]);
    const profile = profileResult.rows[0];
    const calcProfile = {
      height: Number(profile.height_cm), age: Number(profile.age), gender: profile.gender
    };
    if (existing.rowCount) {
      const row = existing.rows[0];
      const values = calculateMetabolism(weight, Number(row.calories_consumed ?? 0), Number(row.activity_calories ?? 0), calcProfile);
      await db.query(
        `update fitfuel.daily_record
         set weight_kg=$2, bmr=$3, tef=$4, tdee=$5, calorie_balance=$6,
             deleted_at=null, updated_at=now()
         where id=$1::bigint`,
        [row.id, weight, values.bmr, values.tef, values.tdee, values.calorieBalance]
      );
      return NextResponse.json({ id: Number(row.id), ...values });
    }
    const values = calculateMetabolism(weight, 0, 0, calcProfile);
    const inserted = await db.query(
      `insert into fitfuel.daily_record
       (user_id,record_date,weight_kg,calories_consumed,manual_calories,activity_calories,
        bmr,tef,tdee,calorie_balance,note,calories_source)
       values ($1,$2::date,$3,0,0,0,$4,$5,$6,$7,null,'manual')
       on conflict (user_id,record_date) do update set
         weight_kg=excluded.weight_kg,bmr=excluded.bmr,tef=excluded.tef,
         tdee=excluded.tdee,calorie_balance=excluded.calorie_balance,
         deleted_at=null,updated_at=now()
       returning id`,
      [user.id, date, weight, values.bmr, values.tef, values.tdee, values.calorieBalance]
    );
    return NextResponse.json({ id: Number(inserted.rows[0].id), ...values });
  } catch (error) { return jsonError(error); }
}
