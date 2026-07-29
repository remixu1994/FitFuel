export type ParsedFood = {
  name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  carbohydrate: number | null;
  protein: number | null;
  fat: number | null;
  confidence: number;
};

export type ParsedMeal = {
  label: string;
  order: number;
  time: string | null;
  calories: number | null;
  carbohydrate: number | null;
  protein: number | null;
  fat: number | null;
  foods: ParsedFood[];
};

export type ParsedElevatineImage =
  | {
      kind: "summary";
      confidence: number;
      month: number;
      day: number;
      year: number | null;
      calories: number;
      carbohydrate: number | null;
      protein: number | null;
      fat: number | null;
      caloriesGoal: number | null;
      carbohydrateGoal: number | null;
      proteinGoal: number | null;
      fatGoal: number | null;
      meals: ParsedMeal[];
    }
  | {
      kind: "detail";
      confidence: number;
      food: ParsedFood;
    };

export type ReviewItem = ParsedFood & {
  id: string;
  imageId: string | null;
  mealLabel: string;
  mealOrder: number;
  mealTime: string | null;
  matchStatus: "matched" | "ambiguous" | "unmatched";
  selected: boolean;
};

export type ReviewDay = {
  id: string;
  recordDate: string;
  selected: boolean;
  calories: number;
  carbohydrate: number | null;
  protein: number | null;
  fat: number | null;
  caloriesGoal: number | null;
  carbohydrateGoal: number | null;
  proteinGoal: number | null;
  fatGoal: number | null;
  warnings: string[];
  items: ReviewItem[];
};
