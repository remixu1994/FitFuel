import { NextResponse } from "next/server";
import { getMimoConfig } from "@/lib/ai-config";
import { normalizeFoodQuery, verifyCandidateToken } from "@/lib/ai-candidate";
import { requireAdmin } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { parseReviewedFood, type ReviewedFood } from "@/lib/food-validation";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
import { addFoodToMeal } from "@/lib/meals";

type ImportBody = {
  candidateToken?: string;
  food?: Partial<ReviewedFood>;
  date?: string;
  mealType?: string;
  quantity?: number;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<ImportBody>(request);
    const payload = verifyCandidateToken(String(body.candidateToken ?? ""), admin.id);
    const food = parseReviewedFood(body.food);
    const { model } = getMimoConfig();
    const quantity = body.date || body.mealType
      ? positiveNumber(body.quantity ?? 1, "数量")
      : 1;
    if ((body.date && !body.mealType) || (!body.date && body.mealType)) {
      throw new ApiError(400, "餐次信息不完整");
    }
    const normalizedQuery = normalizeFoodQuery(payload.query);

    const result = await transaction(async client => {
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))::text as locked",
        [normalizedQuery]
      );
      const mapped = await client.query(
        "select food_id from fitfuel.ai_food_lookup where normalized_query=$1",
        [normalizedQuery]
      );
      const mappedCount = mapped.rowCount ?? 0;
      let sharedFoodId = mappedCount ? Number(mapped.rows[0].food_id) : 0;
      const reused = mappedCount > 0;
      let mealFood = {
        id: sharedFoodId || undefined,
        name: food.name,
        serving: food.serving,
        gram_weight: food.gramWeight,
        calories: food.calories,
        protein: food.protein,
        carbohydrate: food.carbohydrate,
        fat: food.fat,
        dietary_fiber: food.dietaryFiber
      };

      if (!sharedFoodId) {
        await client.query(
          "select pg_advisory_xact_lock(hashtext('fitfuel.ai_food_category'))::text as locked"
        );
        let category = await client.query(
          "select id from food_info.food_category where name='AI 补充' order by id limit 1"
        );
        if (!category.rowCount) {
          category = await client.query(
            `insert into food_info.food_category(parent_id,name,sort_order)
             values(0,'AI 补充',999) returning id`
          );
        }
        const inserted = await client.query(
          `insert into food_info.food
           (name,category_id,brand,description,status)
           values($1,$2,null,'由 Mimo AI 估算并经管理员确认',1) returning id`,
          [food.name, category.rows[0].id]
        );
        sharedFoodId = Number(inserted.rows[0].id);
        await client.query(
          `insert into food_info.food_nutrition
           (food_id,unit,calories,protein,fat,carbohydrate,dietary_fiber)
           values($1,$2,$3,$4,$5,$6,$7)`,
          [sharedFoodId, food.serving, food.calories, food.protein, food.fat,
           food.carbohydrate, food.dietaryFiber]
        );
        await client.query(
          `insert into food_info.food_serving
           (food_id,serving_name,gram_weight,unit_type,is_default)
           values($1,$2,$3,'g',1)`,
          [sharedFoodId, food.serving, food.gramWeight]
        );
        await client.query(
          `insert into fitfuel.ai_food_lookup
           (normalized_query,food_id,model,confidence,created_by)
           values($1,$2,$3,$4,$5)`,
          [normalizedQuery, sharedFoodId, model, payload.food.confidence, admin.id]
        );
        mealFood.id = sharedFoodId;
      } else {
        const stored = await client.query<typeof mealFood>(
          `select f.id,f.name,coalesce(s.serving_name,n.unit,'100g') serving,
                  coalesce(s.gram_weight,100) gram_weight,coalesce(n.calories,0) calories,
                  coalesce(n.protein,0) protein,coalesce(n.carbohydrate,0) carbohydrate,
                  coalesce(n.fat,0) fat,coalesce(n.dietary_fiber,0) dietary_fiber
           from food_info.food f
           left join lateral (
             select * from food_info.food_nutrition where food_id=f.id order by id limit 1
           ) n on true
           left join lateral (
             select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1
           ) s on true where f.id=$1`,
          [sharedFoodId]
        );
        if (!stored.rowCount) throw new ApiError(404, "共享食品不存在");
        mealFood = stored.rows[0];
      }

      await client.query(
        `insert into fitfuel.food_catalog_audit
         (food_id,action,query,model,confidence,raw_candidate,final_values,actor_user_id)
         values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
        [
          sharedFoodId,
          reused ? "ai_reuse" : "ai_import",
          payload.query,
          model,
          payload.food.confidence,
          payload.food,
          food,
          admin.id
        ]
      );

      let itemId = null;
      if (body.date && body.mealType) {
        itemId = await addFoodToMeal(client, {
          userId: admin.id,
          date: body.date,
          mealType: body.mealType,
          quantity,
          food: mealFood,
          foodId: sharedFoodId,
          source: "ai"
        });
      }
      return { foodId: sharedFoodId, itemId, reused };
    });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
