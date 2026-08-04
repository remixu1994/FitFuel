import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { jsonError } from "@/server/http";
export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function chinaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const startParam = new URL(request.url).searchParams.get("start");
    const start = startParam && datePattern.test(startParam)
      ? startParam
      : mondayOf(chinaDate());
    const end = shiftDate(start, 6);
    const result = await db.query(
      `with date_range as (
         select generate_series($2::date, $3::date, interval '1 day')::date as record_date
       )
       select to_char(r.record_date, 'YYYY-MM-DD') as date,
              d.weight_kg, d.calories_consumed, d.activity_calories,
              d.bmr, d.tef, d.tdee, d.calorie_balance,
              (d.id is not null) as has_record
       from date_range r
       left join fitfuel.daily_record d
         on d.user_id = $1 and d.record_date = r.record_date and d.deleted_at is null
       order by r.record_date`,
      [user.id, start, end]
    );
    const rows = result.rows.map(row => ({
      date: row.date,
      weightKg: row.weight_kg !== null && row.weight_kg !== undefined ? Number(row.weight_kg) : null,
      caloriesConsumed: Number(row.calories_consumed ?? 0),
      activityCalories: Number(row.activity_calories ?? 0),
      bmr: Number(row.bmr ?? 0),
      tef: Number(row.tef ?? 0),
      tdee: Number(row.tdee ?? 0),
      calorieBalance: Number(row.calorie_balance ?? 0),
      hasRecord: row.has_record === true || row.has_record === "true" || row.has_record === 1
    }));
    return NextResponse.json({ start, end, rows });
  } catch (error) { return jsonError(error); }
}
