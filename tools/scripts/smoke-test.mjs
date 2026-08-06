import assert from "node:assert/strict";
import argon2 from "argon2";
import ExcelJS from "exceljs";
import { prisma } from "./prisma-client.mjs";

const baseUrl = process.env.APP_URL || "http://localhost:3004";
const origin = new URL(baseUrl).origin;
const stamp = Date.now();
const adminEmail = `fitfuel-smoke-admin-${stamp}@example.com`;
const userEmail = `fitfuel-smoke-user-${stamp}@example.com`;
const adminPassword = "FitFuel-Smoke-Admin-2026!";
const userPassword = "FitFuel-Smoke-User-2026!";
const changedPassword = "FitFuel-Smoke-Changed-2026!";
const aiQuery = `烟熏藜麦南瓜测试碗${stamp}`;
const cookies = new Map();
let adminId;
let userId;
let importedFoodId;

async function call(path, options = {}, actor = "admin") {
  const headers = { origin, ...options.headers };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (cookies.get(actor)) headers.cookie = cookies.get(actor);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookies.set(actor, setCookie.split(";")[0]);
  const body = await response.json().catch(() => null);
  return { response, body };
}

try {
  const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const insertedAdmin = await prisma.app_user.create({
    data: {
      email: adminEmail,
      display_name: "Smoke Admin",
      password_hash: adminHash,
      role: "admin",
      status: 1,
      must_change_password: false,
      password_changed_at: new Date(),
      user_profile: {
        create: {
          height_cm: 175,
          age: 32,
          gender: "male",
          initial_weight_kg: 77.5,
          target_weight_kg: 73
        }
      },
      nutrition_goal: {
        create: {
          goal_type: "cut",
          calories_kcal: 1800,
          protein_g: 110,
          carbohydrate_g: 200,
          fat_g: 60,
          water_ml: 2000
        }
      }
    }
  });
  adminId = Number(insertedAdmin.id);

  const protectedPage = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert.equal(protectedPage.status, 307);

  let result = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: userEmail,
      displayName: "Public registration must fail",
      password: userPassword
    })
  }, "anonymous");
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, "REGISTRATION_CLOSED");

  result = await call("/api/auth/login", {
    method: "POST", body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.role, "admin");

  const emptyFoodSearch = await call("/api/foods?q=");
  assert.equal(emptyFoodSearch.response.status, 200);
  assert.ok(Array.isArray(emptyFoodSearch.body.foods));
  assert.ok(emptyFoodSearch.body.foods.length <= 20);

  const exactFoodSearch = await call(`/api/foods?q=${encodeURIComponent("米饭")}`);
  assert.equal(exactFoodSearch.response.status, 200);
  assert.ok(exactFoodSearch.body.foods.length > 0);
  assert.ok(exactFoodSearch.body.foods.every(food => food.name.includes("米饭")));

  result = await call("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: userEmail,
      displayName: "Smoke User",
      temporaryPassword: userPassword,
      height: 168,
      age: 28,
      gender: "female",
      currentWeight: 62,
      targetWeight: 58
    })
  });
  assert.equal(result.response.status, 201);
  userId = result.body.user.id;
  assert.equal(result.body.temporaryPassword, userPassword);

  result = await call("/api/auth/login", {
    method: "POST", body: JSON.stringify({ email: userEmail, password: userPassword })
  }, "user");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.mustChangePassword, true);

  const blockedBusinessApi = await call("/api/foods?q=米饭", {}, "user");
  assert.equal(blockedBusinessApi.response.status, 403);
  assert.equal(blockedBusinessApi.body.code, "PASSWORD_CHANGE_REQUIRED");

  result = await call("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: userPassword, newPassword: changedPassword })
  }, "user");
  assert.equal(result.response.status, 200);

  result = await call("/api/daily-records/2026-07-29", {
    method: "PUT",
    body: JSON.stringify({ weight: 62, caloriesConsumed: 1800, activityCalories: 500 })
  }, "user");
  if (result.response.status !== 200) console.error("Daily record update failed:", result.body);
  assert.equal(result.response.status, 200);
  const dailyRecord = await call("/api/daily-records/2026-07-29", {}, "user");
  assert.equal(dailyRecord.response.status, 200);
  assert.equal(dailyRecord.body.record.weight_kg, 62);
  const foodRecords = await call("/api/records?days=7", {}, "user");
  assert.equal(foodRecords.response.status, 200);
  assert.equal(foodRecords.body.records.length, 7);
  const recordedDay = foodRecords.body.records.find(day => day.date === "2026-07-29");
  assert.ok(recordedDay);
  assert.equal(recordedDay.totals.calories, 1800);

  const customRangeRecords = await call(
    "/api/records?start=2026-07-27&end=2026-07-29",
    {},
    "user",
  );
  assert.equal(customRangeRecords.response.status, 200);
  assert.equal(customRangeRecords.body.startDate, "2026-07-27");
  assert.equal(customRangeRecords.body.endDate, "2026-07-29");
  assert.equal(customRangeRecords.body.records.length, 3);

  const incompleteRangeRecords = await call(
    "/api/records?start=2026-07-27",
    {},
    "user",
  );
  assert.equal(incompleteRangeRecords.response.status, 400);

  const csv = "\uFEFF日期,摄入(kcal),活动消耗(kcal),体重(kg)\n"
    + "2026-07-20,1842,561,77.5\n"
    + "2026-07-21,2258,981,77.2\n"
    + "2026-07-22,2264,500,78.0\n"
    + "2026-07-23,1976,1104,77.3\n"
    + "2026-07-24,2278,1091,77.3\n"
    + "2026-07-25,2223,645,78.5\n"
    + "2026-07-26,1794,1058,77.6\n";
  const csvForm = new FormData();
  csvForm.append("file",new Blob([csv],{type:"text/csv"}),"fitfuel-smoke.csv");
  const preview = await call("/api/data-imports/preview",{method:"POST",body:csvForm},"user");
  if (preview.response.status !== 201) console.error("CSV preview failed:",preview.body);
  assert.equal(preview.response.status,201);
  assert.equal(preview.body.rows.length,7);

  const committed = await call(`/api/data-imports/${preview.body.batch.id}/commit`,{
    method:"POST",
    body:JSON.stringify({defaultSource:"import",decisions:[]})
  },"user");
  if (committed.response.status !== 200) console.error("Import commit failed:",committed.body);
  assert.equal(committed.response.status,200);
  const duplicateCommit = await call(`/api/data-imports/${preview.body.batch.id}/commit`,{
    method:"POST",body:JSON.stringify({defaultSource:"import"})
  },"user");
  assert.equal(duplicateCommit.response.status,409);

  const importedDay = await call("/api/daily-records/2026-07-20",{},"user");
  assert.equal(importedDay.response.status,200);
  assert.equal(importedDay.body.record.calories_consumed,1842);
  assert.equal(importedDay.body.record.calories_source,"import");
  assert.equal(importedDay.body.record.activity_calories,561);
  assert.equal(importedDay.body.record.weight_kg,77.5);
  assert.equal(importedDay.body.record.bmr,1524);
  assert.equal(importedDay.body.record.tef,147.36);
  assert.equal(importedDay.body.record.tdee,2232.36);
  assert.equal(importedDay.body.record.calorie_balance,390.36);

  for (const format of ["csv","xlsx"]) {
    const exportResponse = await fetch(`${baseUrl}/api/data-exports?range=30d&format=${format}`,{
      headers:{origin,cookie:cookies.get("user")}
    });
    assert.equal(exportResponse.status,200);
    assert.ok((await exportResponse.arrayBuffer()).byteLength>100);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("统计数据");
  worksheet.addRow(["日期","摄入(kcal)","活动消耗(kcal)","体重(kg)"]);
  worksheet.addRow(["2026-07-19",1900,450,77.8]);
  const xlsxForm = new FormData();
  xlsxForm.append("file",new Blob([await workbook.xlsx.writeBuffer()]),"fitfuel-smoke.xlsx");
  const xlsxPreview = await call("/api/data-imports/preview",{method:"POST",body:xlsxForm},"user");
  if (xlsxPreview.response.status !== 201) console.error("XLSX preview failed:",xlsxPreview.body);
  assert.equal(xlsxPreview.response.status,201);
  assert.equal(xlsxPreview.body.rows[0].date,"2026-07-19");

  const rollback = await call(`/api/data-imports/${preview.body.batch.id}/rollback`,{method:"POST"},"user");
  assert.equal(rollback.response.status,200);
  const rolledBackDay = await call("/api/daily-records/2026-07-20",{},"user");
  assert.equal(rolledBackDay.response.status,200);
  assert.equal(rolledBackDay.body.record,null);

  const forbiddenAdminApi = await call("/api/admin/users", {}, "user");
  assert.equal(forbiddenAdminApi.response.status, 403);

  const privateFood = await call("/api/custom-foods", {
    method: "POST",
    body: JSON.stringify({
      name: `用户私有测试餐${stamp}`,
      serving: "1碗",
      gramWeight: 320,
      calories: 500,
      protein: 35,
      carbohydrate: 55,
      fat: 14,
      dietaryFiber: 8
    })
  }, "user");
  assert.equal(privateFood.response.status, 201);

  const privateFoodAsAdmin = await call(`/api/foods?q=${stamp}`, {}, "admin");
  assert.equal(privateFoodAsAdmin.response.status, 200);
  assert.equal(privateFoodAsAdmin.body.foods.length, 0);

  const noResult = await call(`/api/foods?q=${encodeURIComponent(aiQuery)}`, {}, "admin");
  assert.equal(noResult.response.status, 200);
  assert.equal(noResult.body.foods.length, 0);
  assert.equal(noResult.body.canUseAi, true);

  const aiSearch = await call("/api/admin/foods/ai-search", {
    method: "POST", body: JSON.stringify({ query: aiQuery })
  });
  if (aiSearch.response.status !== 200) console.error("Mimo lookup failed:", aiSearch.body);
  assert.equal(aiSearch.response.status, 200);
  assert.ok(aiSearch.body.candidateToken);

  const candidate = aiSearch.body.candidate;
  const imported = await call("/api/admin/foods/ai-import", {
    method: "POST",
    body: JSON.stringify({
      candidateToken: aiSearch.body.candidateToken,
      food: {
        name: candidate.name,
        serving: candidate.serving,
        gramWeight: candidate.gram_weight,
        calories: candidate.calories,
        protein: candidate.protein,
        carbohydrate: candidate.carbohydrate,
        fat: candidate.fat,
        dietaryFiber: candidate.dietary_fiber
      }
    })
  });
  if (imported.response.status !== 201) console.error("AI import failed:", imported.body);
  assert.equal(imported.response.status, 201);
  importedFoodId = imported.body.foodId;

  const sharedAsUser = await call(`/api/foods?q=${encodeURIComponent(candidate.name)}`, {}, "user");
  assert.equal(sharedAsUser.response.status, 200);
  assert.ok(sharedAsUser.body.foods.some(food => food.key === `shared:${importedFoodId}`));
  assert.equal(sharedAsUser.body.canUseAi, false);

  const reused = await call("/api/admin/foods/ai-search", {
    method: "POST", body: JSON.stringify({ query: aiQuery })
  });
  assert.equal(reused.response.status, 200);
  assert.equal(reused.body.reused, true);
  assert.equal(reused.body.existingFood.key, `shared:${importedFoodId}`);

  const reset = await call(`/api/admin/users/${userId}/reset-password`, {
    method: "POST", body: JSON.stringify({ temporaryPassword: userPassword })
  });
  assert.equal(reset.response.status, 200);
  const revokedSession = await call("/api/auth/session", {}, "user");
  assert.equal(revokedSession.response.status, 401);

  const disabled = await call(`/api/admin/users/${userId}`, {
    method: "PATCH", body: JSON.stringify({ status: 0 })
  });
  assert.equal(disabled.response.status, 200);
  const disabledLogin = await call("/api/auth/login", {
    method: "POST", body: JSON.stringify({ email: userEmail, password: userPassword })
  }, "disabled");
  assert.equal(disabledLogin.response.status, 401);

  console.log("FitFuel admin, auth, isolation, and shared AI smoke test passed.");
} finally {
  if (importedFoodId) {
    await prisma.food_catalog_audit.deleteMany({ where: { food_id: importedFoodId } });
    await prisma.ai_food_lookup.deleteMany({ where: { food_id: importedFoodId } });
    await prisma.food.deleteMany({ where: { id: importedFoodId } });
  }
  if (userId) await prisma.app_user.deleteMany({ where: { id: BigInt(userId) } });
  if (adminId) await prisma.app_user.deleteMany({ where: { id: BigInt(adminId) } });
  await prisma.$disconnect();
}
