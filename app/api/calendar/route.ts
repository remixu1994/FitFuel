import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { db, numbers } from "@/server/db";
import { ApiError, jsonError } from "@/server/http";

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const month=new URL(request.url).searchParams.get("month")??"";
    if(!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400,"月份格式无效");
    const result=await db.query(`with days as (select generate_series($2::date,(date_trunc('month',$2::date)+interval '1 month - 1 day')::date,interval '1 day')::date as day), meal_totals as (select d.record_date,sum(mi.protein_snapshot) protein,sum(mi.carbohydrate_snapshot) carbs,sum(mi.fat_snapshot) fat from fitfuel.daily_record d join fitfuel.meal m on m.daily_record_id=d.id and m.deleted_at is null join fitfuel.meal_item mi on mi.meal_id=m.id and mi.deleted_at is null where d.user_id=$1 and d.record_date between $2::date and (date_trunc('month',$2::date)+interval '1 month - 1 day')::date group by d.record_date)
      select to_char(days.day,'YYYY-MM-DD') date,coalesce(d.calories_consumed,0) calories,coalesce(d.elevatine_calories,0) elevatine_calories,coalesce(d.calories_source,'') calories_source,
      case when d.macro_source='elevatine' then coalesce(d.elevatine_carbohydrate,0) else coalesce(t.carbs,0) end carbs,
      case when d.macro_source='elevatine' then coalesce(d.elevatine_protein,0) else coalesce(t.protein,0) end protein,
      case when d.macro_source='elevatine' then coalesce(d.elevatine_fat,0) else coalesce(t.fat,0) end fat
      from days left join fitfuel.daily_record d on d.user_id=$1 and d.record_date=days.day and d.deleted_at is null left join meal_totals t on t.record_date=days.day order by days.day`,[user.id,`${month}-01`]);
    return NextResponse.json({month,days:result.rows.map(numbers)});
  }catch(error){return jsonError(error);}
}
