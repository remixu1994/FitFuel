import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";

type FoodBody = {
  id?: number; name?: string; brand?: string; serving?: string;
  gramWeight?: number; calories?: number; protein?: number;
  carbohydrate?: number; fat?: number; dietaryFiber?: number; restore?: boolean;
};

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const includeDeleted = new URL(request.url).searchParams.get("deleted") === "true";
    const result = await db.query(
      `select id, name, brand, serving_name, gram_weight, calories, protein,
              carbohydrate, fat, dietary_fiber, deleted_at
       from fitfuel.custom_food where user_id=$1
         and ($2::boolean or deleted_at is null)
       order by deleted_at nulls first, updated_at desc`,
      [user.id, includeDeleted]
    );
    return NextResponse.json({ foods: result.rows.map(numbers) });
  } catch (error) { return jsonError(error); }
}

function parseFood(body: FoodBody) {
  const name = body.name?.trim();
  if (!name || name.length > 200) throw new ApiError(400, "请输入食品名称");
  return {
    name,
    brand: body.brand?.trim() || null,
    serving: body.serving?.trim() || "100g",
    gramWeight: positiveNumber(body.gramWeight ?? 100, "份量"),
    calories: positiveNumber(body.calories, "热量", true),
    protein: positiveNumber(body.protein ?? 0, "蛋白质", true),
    carbohydrate: positiveNumber(body.carbohydrate ?? 0, "碳水", true),
    fat: positiveNumber(body.fat ?? 0, "脂肪", true),
    dietaryFiber: positiveNumber(body.dietaryFiber ?? 0, "膳食纤维", true)
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const food = parseFood(await readJson<FoodBody>(request));
    const result = await db.query(
      `insert into fitfuel.custom_food
       (user_id,name,brand,serving_name,gram_weight,calories,protein,carbohydrate,fat,dietary_fiber)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [user.id, food.name, food.brand, food.serving, food.gramWeight, food.calories,
       food.protein, food.carbohydrate, food.fat, food.dietaryFiber]
    );
    return NextResponse.json({ id: Number(result.rows[0].id) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<FoodBody>(request);
    const id = positiveNumber(body.id, "食品 ID");
    if (body.restore) {
      await db.query(
        "update fitfuel.custom_food set deleted_at=null,updated_at=now() where id=$1 and user_id=$2",
        [id, user.id]
      );
    } else {
      const food = parseFood(body);
      const result = await db.query(
        `update fitfuel.custom_food set name=$3,brand=$4,serving_name=$5,gram_weight=$6,
         calories=$7,protein=$8,carbohydrate=$9,fat=$10,dietary_fiber=$11,updated_at=now()
         where id=$1 and user_id=$2 and deleted_at is null`,
        [id, user.id, food.name, food.brand, food.serving, food.gramWeight, food.calories,
         food.protein, food.carbohydrate, food.fat, food.dietaryFiber]
      );
      if (!result.rowCount) throw new ApiError(404, "食品不存在");
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ id?: number }>(request);
    const id = positiveNumber(body.id, "食品 ID");
    const result = await db.query(
      "update fitfuel.custom_food set deleted_at=now(),updated_at=now() where id=$1 and user_id=$2 and deleted_at is null",
      [id, user.id]
    );
    if (!result.rowCount) throw new ApiError(404, "食品不存在");
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
