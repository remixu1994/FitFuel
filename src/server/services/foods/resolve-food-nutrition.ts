import { prisma } from "@/server/db";

export type ResolvedFoodNutrition = {
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  dietaryFiber: number;
  confidence: number;
  source: "shared" | "custom";
};

type NutritionValues = Omit<ResolvedFoodNutrition, "confidence" | "source">;

const MASS_UNITS = new Set(["g", "克", "公克"]);
const VOLUME_UNITS = new Set(["ml", "毫升"]);

export function normalizeFoodName(value: string) {
  return value.replace(/[\s（）()·・]/g, "").toLowerCase();
}

function normalizedUnit(value: string | null | undefined) {
  return (value || "份").trim().toLowerCase();
}

function isMeasuredUnit(unit: string) {
  return MASS_UNITS.has(unit) || VOLUME_UNITS.has(unit);
}

function embeddedMeasuredQuantity(value: string | null | undefined) {
  const match = (value || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(g|克|公克|ml|毫升)/i);
  return match ? Number(match[1]) : null;
}

export function sharedFoodMultiplier(input: {
  quantity: number | null;
  unit: string | null;
  nutritionUnit: string | null;
  servingName: string | null;
  servingWeight: number | null;
}) {
  const quantity = input.quantity ?? 1;
  const actualUnit = normalizedUnit(input.unit);
  const nutritionUnit = normalizedUnit(input.nutritionUnit);
  const nutritionMeasured = embeddedMeasuredQuantity(input.nutritionUnit);
  const servingMeasured = embeddedMeasuredQuantity(input.servingName);
  const servingWeight = input.servingWeight && input.servingWeight > 0
    ? input.servingWeight
    : servingMeasured || 100;

  if (isMeasuredUnit(actualUnit)) {
    const base = nutritionMeasured ?? servingWeight;
    return quantity / Math.max(1, base);
  }

  if (nutritionMeasured || isMeasuredUnit(nutritionUnit)) {
    const base = nutritionMeasured ?? servingWeight;
    return quantity * servingWeight / Math.max(1, base);
  }
  return quantity;
}

function customFoodMultiplier(quantity: number | null, unit: string | null, gramWeight: number) {
  const actual = quantity ?? 1;
  return isMeasuredUnit(normalizedUnit(unit))
    ? actual / Math.max(1, gramWeight)
    : actual;
}

function scaled(values: NutritionValues, multiplier: number): NutritionValues {
  const scale = (value: number) => Math.round(value * multiplier * 100) / 100;
  return {
    calories: scale(values.calories),
    protein: scale(values.protein),
    carbohydrate: scale(values.carbohydrate),
    fat: scale(values.fat),
    dietaryFiber: scale(values.dietaryFiber)
  };
}

export async function resolveFoodNutritionFromCatalog(input: {
  userId: bigint;
  name: string;
  quantity: number | null;
  unit: string | null;
}): Promise<ResolvedFoodNutrition | null> {
  const targetName = normalizeFoodName(input.name);
  if (!targetName) return null;
  const searchToken = targetName.slice(0, Math.min(2, targetName.length));

  const customCandidates = await prisma.custom_food.findMany({
    where: {
      user_id: input.userId,
      deleted_at: null,
      name: { contains: searchToken, mode: "insensitive" }
    },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    take: 20
  });
  const custom = customCandidates.find(food => normalizeFoodName(food.name) === targetName);
  if (custom) {
    const multiplier = customFoodMultiplier(input.quantity, input.unit, Number(custom.gram_weight));
    return {
      ...scaled({
        calories: Number(custom.calories),
        protein: Number(custom.protein),
        carbohydrate: Number(custom.carbohydrate),
        fat: Number(custom.fat),
        dietaryFiber: Number(custom.dietary_fiber)
      }, multiplier),
      confidence: 1,
      source: "custom"
    };
  }

  const sharedCandidates = await prisma.food.findMany({
    where: {
      status: 1,
      name: { contains: searchToken, mode: "insensitive" }
    },
    include: {
      food_nutrition: { orderBy: { id: "asc" }, take: 1 },
      food_serving: { orderBy: [{ is_default: "desc" }, { id: "asc" }], take: 1 }
    },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    take: 20
  });
  const shared = sharedCandidates.find(food =>
    normalizeFoodName(food.name) === targetName && food.food_nutrition.length > 0
  );
  if (!shared) return null;
  const nutrition = shared.food_nutrition[0];
  const serving = shared.food_serving[0];
  const multiplier = sharedFoodMultiplier({
    quantity: input.quantity,
    unit: input.unit,
    nutritionUnit: nutrition.unit,
    servingName: serving?.serving_name ?? null,
    servingWeight: serving?.gram_weight ?? null
  });
  return {
    ...scaled({
      calories: nutrition.calories,
      protein: nutrition.protein ?? 0,
      carbohydrate: nutrition.carbohydrate ?? 0,
      fat: nutrition.fat ?? 0,
      dietaryFiber: nutrition.dietary_fiber ?? 0
    }, multiplier),
    confidence: 1,
    source: "shared"
  };
}
