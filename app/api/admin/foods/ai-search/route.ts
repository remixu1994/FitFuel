import { NextResponse } from "next/server";
import { createCandidateToken, normalizeFoodQuery } from "@/server/ai-candidate";
import { requireAdmin } from "@/server/auth";
import { db, numbers } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/server/http";
import { searchFoodWithMimo } from "@/server/mimo";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<{ query?: string }>(request);
    const query = body.query?.trim() ?? "";
    if (query.length < 2 || query.length > 80) throw new ApiError(400, "请输入 2–80 个字符的食品名称");
    const normalizedQuery = normalizeFoodQuery(query);
    const existing = await db.query(
      `select 'shared:' || f.id key,f.name,f.brand,
              coalesce(s.serving_name,n.unit,'100g') serving,
              coalesce(s.gram_weight,100) gram_weight,
              coalesce(n.calories,0) calories,coalesce(n.protein,0) protein,
              coalesce(n.carbohydrate,0) carbohydrate,coalesce(n.fat,0) fat,
              coalesce(n.dietary_fiber,0) dietary_fiber,'shared' source
       from fitfuel.ai_food_lookup l
       join food_info.food f on f.id=l.food_id
       left join lateral (
         select * from food_info.food_nutrition where food_id=f.id order by id limit 1
       ) n on true
       left join lateral (
         select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1
       ) s on true
       where l.normalized_query=$1 and f.status=1`,
      [normalizedQuery]
    );
    if (existing.rowCount) {
      return NextResponse.json({ existingFood: numbers(existing.rows[0]), reused: true });
    }
    const candidate = await searchFoodWithMimo(query);
    const candidateToken = createCandidateToken(admin.id, query, candidate);
    return NextResponse.json({ candidate, candidateToken, reused: false });
  } catch (error) {
    return jsonError(error);
  }
}
