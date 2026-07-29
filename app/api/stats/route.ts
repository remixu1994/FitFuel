import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { jsonError } from "@/lib/http";

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const requested=new URL(request.url).searchParams.get("range") ?? "30d";
    const days=requested==="7d"?7:requested==="90d"?90:30;
    const [records,profile,weekly]=await Promise.all([
      db.query(
        `select record_date,weight_kg,calories_consumed,meal_calories,manual_calories,
                imported_calories,calories_source,activity_calories,bmr,tef,tdee,calorie_balance
         from fitfuel.daily_record
         where user_id=$1 and deleted_at is null and record_date>=current_date-$2::int
         order by record_date`,[user.id,days]
      ),
      db.query(
        `select initial_weight_kg,target_weight_kg,height_cm,age,gender
         from fitfuel.user_profile where user_id=$1`,[user.id]
      ),
      db.query(
        `select * from fitfuel.weekly_summary where user_id=$1
         order by week_start desc limit 12`,[user.id]
      )
    ]);
    const rows=records.rows.map(numbers);
    const average=(key:string)=>rows.length?rows.reduce((sum,row)=>sum+Number(row[key]??0),0)/rows.length:0;
    const firstWeight=rows.find(row=>row.weight_kg)?.weight_kg ?? profile.rows[0]?.initial_weight_kg ?? null;
    const latestWeight=[...rows].reverse().find(row=>row.weight_kg)?.weight_kg ?? firstWeight;
    const avgIntake=average("calories_consumed");
    const avgTdee=average("tdee");
    const actualLoss=firstWeight&&latestWeight?Number(firstWeight)-Number(latestWeight):0;
    const actualTdee=rows.length>1?avgIntake+actualLoss*7700/Math.max(1,days):avgTdee;
    const target=Number(profile.rows[0]?.target_weight_kg ?? latestWeight ?? 0);
    const weeklyRate=Math.max(0,average("calorie_balance")*7/7700);
    const weeksRemaining=weeklyRate>0&&latestWeight?Math.max(0,(Number(latestWeight)-target)/weeklyRate):null;
    const estimatedDate=weeksRemaining!==null?new Date(Date.now()+weeksRemaining*7*86400000).toISOString().slice(0,10):null;
    return NextResponse.json({
      range:`${days}d`,records:rows,weekly:weekly.rows.map(numbers),
      profile:profile.rowCount?numbers(profile.rows[0]):null,
      summary:{
        averageIntake:Math.round(avgIntake),averageActivity:Math.round(average("activity_calories")),
        averageTdee:Math.round(avgTdee),averageBalance:Math.round(average("calorie_balance")),
        actualTdee:Math.round(actualTdee||0),currentWeight:latestWeight,
        startWeight:firstWeight,targetWeight:target,weeklyRate,estimatedDate
      }
    });
  }catch(error){return jsonError(error);}
}
