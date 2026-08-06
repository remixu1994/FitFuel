import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { db, numbers } from "@/server/db";
import { ApiError, jsonError } from "@/server/http";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length > 80) throw new ApiError(400, "搜索关键词不能超过 80 个字符");
    if (!query) {
      const result = await db.query(
        `with recent as (
           select case when mi.custom_food_id is not null then 'custom' else 'shared' end source,
                  coalesce(mi.custom_food_id,mi.food_id) food_id,
                  max(mi.created_at) used_at
           from fitfuel.meal_item mi
           join fitfuel.meal m on m.id=mi.meal_id and m.deleted_at is null
           join fitfuel.daily_record d on d.id=m.daily_record_id and d.deleted_at is null
           where d.user_id=$1 and mi.deleted_at is null
             and (mi.custom_food_id is not null or mi.food_id is not null)
           group by 1,2
           order by used_at desc
           limit 20
         ), shared_foods as (
           select 'shared:' || f.id as key,f.name,f.brand,
                  coalesce(s.serving_name,n.unit,'100g') serving,
                  coalesce(s.gram_weight,100) gram_weight,
                  coalesce(n.calories,0) calories,coalesce(n.protein,0) protein,
                  coalesce(n.carbohydrate,0) carbohydrate,coalesce(n.fat,0) fat,
                  coalesce(n.dietary_fiber,0) dietary_fiber,'shared' source,r.used_at
           from recent r
           join food_info.food f on r.source='shared' and f.id=r.food_id and f.status=1
           left join lateral (
             select * from food_info.food_nutrition where food_id=f.id order by id limit 1
           ) n on true
           left join lateral (
             select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1
           ) s on true
         ), personal_foods as (
           select 'custom:' || c.id key,c.name,c.brand,c.serving_name serving,
                  c.gram_weight,c.calories,c.protein,c.carbohydrate,c.fat,c.dietary_fiber,
                  'custom' source,r.used_at
           from recent r
           join fitfuel.custom_food c on r.source='custom' and c.id=r.food_id
           where c.user_id=$1 and c.deleted_at is null
         )
         select * from (
           select * from personal_foods union all select * from shared_foods
         ) foods
         order by used_at desc
         limit 20`,
        [user.id]
      );
      return NextResponse.json({
        foods: result.rows.map(numbers),
        canUseAi: user.role === "admin"
      });
    }
    const pattern = `%${query}%`;
    const result = await db.query(
      `with shared_foods as (
         select 'shared:' || f.id as key,f.name,f.brand,
                coalesce(s.serving_name,n.unit,'100g') serving,
                coalesce(s.gram_weight,100) gram_weight,
                coalesce(n.calories,0) calories,coalesce(n.protein,0) protein,
                coalesce(n.carbohydrate,0) carbohydrate,coalesce(n.fat,0) fat,
                coalesce(n.dietary_fiber,0) dietary_fiber,'shared' source
         from food_info.food f
         left join lateral (
           select * from food_info.food_nutrition where food_id=f.id order by id limit 1
         ) n on true
         left join lateral (
           select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1
         ) s on true
         where f.status=1 and f.name ilike $1
         order by f.name limit 20
       ), personal_foods as (
         select 'custom:' || id key,name,brand,serving_name serving,
                gram_weight,calories,protein,carbohydrate,fat,dietary_fiber,'custom' source
         from fitfuel.custom_food
         where user_id=$2 and deleted_at is null and name ilike $1
         order by name limit 20
       )
       select * from personal_foods union all select * from shared_foods limit 20`,
      [pattern, user.id]
    );
    return NextResponse.json({
      foods: result.rows.map(numbers),
      canUseAi: user.role === "admin"
    });
  } catch (error) {
    return jsonError(error);
  }
}
