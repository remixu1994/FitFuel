import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { estimateFoodPortionWithMimo } from "../lib/mimo";
import { calculateMetabolism } from "../lib/nutrition";

const commit = process.argv.includes("--commit");
const email = process.argv
  .find(value => value.startsWith("--user-email="))
  ?.slice("--user-email=".length)
  .trim()
  .toLowerCase();
const limitArg = process.argv.find(value => value.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.slice("--limit=".length)) || 1) : null;

function keyOf(name: string, unit: string) {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

async function main() {
  if (!email) throw new Error("必须通过 --user-email 指定要修复的单个用户");
  const items = await prisma.meal_item.findMany({
    where: {
      deleted_at: null,
      source: "elevatine",
      calories_snapshot: { lte: 0 },
      meal: {
        deleted_at: null,
        daily_record: {
          deleted_at: null,
          app_user: { email: { equals: email, mode: "insensitive" } }
        }
      }
    },
    select: {
      id: true,
      food_name_snapshot: true,
      quantity: true,
      unit: true,
      meal: { select: { daily_record_id: true } }
    },
    orderBy: { id: "asc" }
  });
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = keyOf(item.food_name_snapshot, item.unit);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  console.log(JSON.stringify({
    zeroItems: items.length,
    uniqueFoods: new Set(items.map(item => item.food_name_snapshot.trim().toLowerCase())).size,
    uniqueEstimateRequests: groups.size,
    userEmail: email,
    mode: commit ? "commit" : "preview"
  }));
  if (!commit || !items.length) return;

  const affectedRecords = new Set<bigint>();
  let updated = 0;
  const failures: Array<{ food: string; error: string }> = [];
  const pendingGroups = [...groups.values()].slice(0, limit ?? groups.size);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, pendingGroups.length) }, async () => {
    while (cursor < pendingGroups.length) {
      const group = pendingGroups[cursor++];
      const sample = group[0];
      try {
        const isMass = /^(g|克|ml|毫升)$/i.test(sample.unit.trim());
        const baseQuantity = isMass ? 100 : 1;
        const estimate = await estimateFoodPortionWithMimo(
          sample.food_name_snapshot,
          baseQuantity,
          sample.unit
        );
        for (const item of group) {
          const multiplier = Number(item.quantity) / baseQuantity;
          const scaled = (value: number) => Math.round(value * multiplier * 100) / 100;
          await prisma.meal_item.update({
            where: { id: item.id },
            data: {
              calories_snapshot: new Prisma.Decimal(scaled(estimate.calories)),
              protein_snapshot: new Prisma.Decimal(scaled(estimate.protein)),
              carbohydrate_snapshot: new Prisma.Decimal(scaled(estimate.carbohydrate)),
              fat_snapshot: new Prisma.Decimal(scaled(estimate.fat)),
              dietary_fiber_snapshot: new Prisma.Decimal(scaled(estimate.dietaryFiber)),
              updated_at: new Date()
            }
          });
          affectedRecords.add(item.meal.daily_record_id);
        }
        updated += group.length;
        console.log(`${sample.food_name_snapshot} ${baseQuantity}${sample.unit}: ${estimate.calories} kcal`);
      } catch (error) {
        const failure = {
          food: sample.food_name_snapshot,
          error: error instanceof Error ? error.message : "unknown error"
        };
        failures.push(failure);
        console.error(`${failure.food}: ${failure.error}`);
      }
    }
  }));

  for (const id of affectedRecords) {
    const record = await prisma.daily_record.findUnique({
      where: { id },
      include: {
        app_user: { include: { user_profile: true } },
        meal: {
          where: { deleted_at: null },
          include: { meal_item: { where: { deleted_at: null } } }
        }
      }
    });
    if (!record) continue;
    const mealCalories = Math.round(record.meal.reduce(
      (mealSum, meal) => mealSum + meal.meal_item.reduce(
        (itemSum, item) => itemSum + Number(item.calories_snapshot),
        0
      ),
      0
    ));
    const intake = record.calories_source === "elevatine" && record.elevatine_calories !== null
      ? record.elevatine_calories
      : record.calories_source === "import" && record.imported_calories !== null
        ? record.imported_calories
        : record.calories_source === "manual" && record.manual_calories !== null
          ? record.manual_calories
          : mealCalories;
    const profile = record.app_user.user_profile;
    const weight = Number(record.weight_kg || 0);
    const metabolism = profile && weight > 0
      ? calculateMetabolism(weight, intake, Number(record.activity_calories), {
          height: Number(profile.height_cm),
          age: profile.age,
          gender: profile.gender as "male" | "female" | "other"
        })
      : {
          bmr: 0,
          tef: intake * .08,
          tdee: Number(record.activity_calories) + intake * .08,
          calorieBalance: Number(record.activity_calories) - intake * .92
        };
    await prisma.daily_record.update({
      where: { id },
      data: {
        meal_calories: mealCalories,
        calories_consumed: intake,
        bmr: new Prisma.Decimal(metabolism.bmr),
        tef: new Prisma.Decimal(metabolism.tef),
        tdee: new Prisma.Decimal(metabolism.tdee),
        calorie_balance: new Prisma.Decimal(metabolism.calorieBalance),
        updated_at: new Date()
      }
    });
  }
  console.log(JSON.stringify({ updated, affectedDays: affectedRecords.size, failures }));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
