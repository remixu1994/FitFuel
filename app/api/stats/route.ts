import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers, prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";

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

function toDateString(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function estimateGoalDate(rows: Record<string, unknown>[], periodStart: string, target: number) {
  const start = Date.parse(`${periodStart}T00:00:00.000Z`);
  const points = rows
    .map(row => ({
      x: (Date.parse(`${toDateString(row.record_date)}T00:00:00.000Z`) - start) / 86400000,
      y: row.weight_kg
    }))
    .filter((p): p is { x: number; y: number } => p.y !== null && p.y !== undefined && Number(p.y) > 0);
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + Number(p.y), 0);
  const sumXY = points.reduce((s, p) => s + p.x * Number(p.y), 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-9) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  if (slope >= -0.001) return null;
  const intercept = (sumY - slope * sumX) / n;
  const lastX = Math.max(...points.map(p => p.x));
  const projected = slope * lastX + intercept;
  const remaining = Math.max(0, projected - target);
  if (remaining <= 0) return null;
  const weeks = remaining / (-slope * 7);
  if (!Number.isFinite(weeks) || weeks > 520) return null;
  return new Date(Date.now() + weeks * 7 * 86400000).toISOString().slice(0, 10);
}

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const requested=new URL(request.url).searchParams.get("range") ?? "30d";
    const days=requested==="7d"?7:requested==="90d"?90:30;
    const periodEnd=chinaDate();
    const periodStart=shiftDate(periodEnd,1-days);
    const periodStartDate=new Date(`${periodStart}T00:00:00.000Z`);
    const periodEndDate=new Date(`${periodEnd}T00:00:00.000Z`);
    const [records,profile,weekly,periodOverride]=await Promise.all([
      db.query(
        `select record_date,weight_kg,calories_consumed,meal_calories,manual_calories,
                imported_calories,calories_source,activity_calories,bmr,tef,tdee,calorie_balance
         from fitfuel.daily_record
         where user_id=$1 and deleted_at is null and record_date between $2::date and $3::date
         order by record_date`,[user.id,periodStart,periodEnd]
      ),
      db.query(
        `select initial_weight_kg,target_weight_kg,height_cm,age,gender
         from fitfuel.user_profile where user_id=$1`,[user.id]
      ),
      db.query(
        `with week_range as (
           select distinct date_trunc('week', record_date)::date as week_start
           from fitfuel.daily_record where user_id=$1 and deleted_at is null
         ),
         boundary as (
           select
             w.week_start,
             min(d.weight_kg) filter (where d.record_date >= w.week_start - 1 and d.record_date <= w.week_start + 1) as start_weight_kg,
             min(d.weight_kg) filter (where d.record_date >= w.week_start + 5 and d.record_date <= w.week_start + 7) as end_weight_kg
           from week_range w
           left join fitfuel.daily_record d
             on d.user_id = $1 and d.deleted_at is null and d.weight_kg is not null
           group by w.week_start
         ),
         summary as (
           select date_trunc('week', record_date)::date as week_start,
                  round((sum(calorie_balance) / 7700.0)::numeric, 3) as theoretical_weight_change_kg
           from fitfuel.daily_record
           where user_id = $1 and deleted_at is null
           group by 1
         )
         select to_char(w.week_start, 'YYYY-MM-DD') as week_start,
                b.start_weight_kg, b.end_weight_kg, s.theoretical_weight_change_kg
         from week_range w
         left join boundary b on b.week_start = w.week_start
         left join summary s on s.week_start = w.week_start
         order by w.week_start desc
         limit 12`,[user.id]
      ),
      prisma.activity_period_total.findUnique({
        where:{
          user_id_period_start_period_end:{
            user_id:user.id,period_start:periodStartDate,period_end:periodEndDate
          }
        }
      })
    ]);
    const rows=records.rows.map(numbers);
    const average=(key:string)=>rows.length?rows.reduce((sum,row)=>sum+Number(row[key]??0),0)/rows.length:0;
    const sum=(key:string)=>rows.reduce((total,row)=>total+Number(row[key]??0),0);
    const firstWeight=rows.find(row=>row.weight_kg)?.weight_kg ?? profile.rows[0]?.initial_weight_kg ?? null;
    const latestWeight=[...rows].reverse().find(row=>row.weight_kg)?.weight_kg ?? firstWeight;
    const avgIntake=average("calories_consumed");
    const avgTdee=average("tdee");
    const dailyActivityTotal=sum("activity_calories");
    const periodActivityTotal=periodOverride
      ? Number(periodOverride.active_calories_total.toString())
      : dailyActivityTotal;
    const periodTdee=sum("bmr")+sum("tef")+periodActivityTotal;
    const periodBalance=periodTdee-sum("calories_consumed");
    const actualLoss=firstWeight&&latestWeight?Number(firstWeight)-Number(latestWeight):0;
    const actualTdee=rows.length>1?avgIntake+actualLoss*7700/Math.max(1,days):avgTdee;
    const target=Number(profile.rows[0]?.target_weight_kg ?? latestWeight ?? 0);
    const weeklyRate=Math.max(0,average("calorie_balance")*7/7700);
    const estimatedDate=estimateGoalDate(rows,periodStart,target);
    return NextResponse.json({
      range:`${days}d`,records:rows,weekly:weekly.rows.map(numbers),
      profile:profile.rowCount?numbers(profile.rows[0]):null,
      summary:{
        averageIntake:Math.round(avgIntake),averageActivity:Math.round(periodActivityTotal/days),
        averageTdee:Math.round(avgTdee),averageBalance:Math.round(average("calorie_balance")),
        actualTdee:Math.round(actualTdee||0),currentWeight:latestWeight,
        startWeight:firstWeight,targetWeight:target,weeklyRate,estimatedDate,
        periodStart,periodEnd,periodDays:days,recordedDays:rows.length,
        periodActivityTotal:Math.round(periodActivityTotal),
        dailyActivityTotal:Math.round(dailyActivityTotal),
        periodActivitySource:periodOverride?"period_manual":"daily",
        periodTdee:Math.round(periodTdee),periodBalance:Math.round(periodBalance)
      }
    });
  }catch(error){return jsonError(error);}
}
