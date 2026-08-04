export type ProfileForCalculation = {
  height: number;
  age: number;
  gender: "male" | "female" | "other";
};

export function calculateMetabolism(
  weight: number,
  intake: number,
  activity: number,
  profile: ProfileForCalculation
) {
  const genderOffset = profile.gender === "female" ? -161 : 5;
  const bmr = 10 * weight + 6.25 * profile.height - 5 * profile.age + genderOffset;
  const tef = intake * 0.08;
  const tdee = bmr + activity + tef;
  return { bmr, tef, tdee, calorieBalance: tdee - intake };
}
