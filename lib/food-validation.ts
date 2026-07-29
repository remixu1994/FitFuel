import { ApiError, positiveNumber } from "@/lib/http";

export type ReviewedFood = {
  name: string;
  serving: string;
  gramWeight: number;
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  dietaryFiber: number;
};

export function parseReviewedFood(input: Partial<ReviewedFood> | undefined): ReviewedFood {
  const name = input?.name?.trim();
  if (!name || name.length > 200) throw new ApiError(400, "食品名称无效");
  const serving = input?.serving?.trim().slice(0, 60) || "100克";
  const bounded = (value: unknown, field: string, maximum: number, allowZero = true) => {
    const number = positiveNumber(value, field, allowZero);
    if (number > maximum) throw new ApiError(400, `${field}超出合理范围`);
    return Math.round(number * 100) / 100;
  };
  return {
    name,
    serving,
    gramWeight: bounded(input?.gramWeight, "份量", 2000, false),
    calories: bounded(input?.calories, "热量", 5000),
    protein: bounded(input?.protein ?? 0, "蛋白质", 500),
    carbohydrate: bounded(input?.carbohydrate ?? 0, "碳水", 500),
    fat: bounded(input?.fat ?? 0, "脂肪", 500),
    dietaryFiber: bounded(input?.dietaryFiber ?? 0, "膳食纤维", 500)
  };
}
