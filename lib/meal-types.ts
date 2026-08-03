const legacyMealOrder: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 };

export function mealOrder(mealType: string) {
  const legacy = legacyMealOrder[mealType];
  if (legacy) return legacy;
  const match = /^(?:meal|elevatine)_(\d+)$/.exec(mealType);
  return match ? Number(match[1]) : null;
}

export function mealLabel(order: number) { return `第 ${order} 餐`; }
export function mealType(order: number) { return `meal_${order}`; }
