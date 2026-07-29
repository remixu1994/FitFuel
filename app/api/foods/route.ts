import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length > 80) throw new ApiError(400, "搜索关键词不能超过 80 个字符");
    if (!query) {
      return NextResponse.json({
        foods: [],
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
         order by f.name limit 40
       ), personal_foods as (
         select 'custom:' || id key,name,brand,serving_name serving,
                gram_weight,calories,protein,carbohydrate,fat,dietary_fiber,'custom' source
         from fitfuel.custom_food
         where user_id=$2 and deleted_at is null and name ilike $1
         order by name limit 40
       )
       select * from personal_foods union all select * from shared_foods limit 50`,
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
