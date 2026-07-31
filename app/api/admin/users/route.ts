import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, numbers, transaction } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";

type CreateUserBody = {
  email?: string;
  displayName?: string;
  temporaryPassword?: string;
  height?: number;
  age?: number;
  gender?: "male" | "female" | "other";
  currentWeight?: number;
  targetWeight?: number;
};

export async function GET() {
  try {
    await requireAdmin();
    const result = await db.query(
      `select u.id,u.email,u.display_name,u.role,u.status,u.must_change_password,
              u.last_login_at,u.created_at,p.height_cm,p.age,p.gender,
              p.initial_weight_kg,p.target_weight_kg
       from fitfuel.app_user u
       join fitfuel.user_profile p on p.user_id=u.id
       order by u.role desc,u.created_at`
    );
    return NextResponse.json({ users: result.rows.map(numbers) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<CreateUserBody>(request);
    const email = body.email?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "请输入有效邮箱");
    if (!displayName || displayName.length > 100) throw new ApiError(400, "请输入昵称");
    const temporaryPassword = body.temporaryPassword || randomBytes(12).toString("base64url");
    if (temporaryPassword.length < 12 || temporaryPassword.length > 128) {
      throw new ApiError(400, "临时密码长度需为 12–128 位");
    }
    const height = positiveNumber(body.height, "身高");
    const age = positiveNumber(body.age, "年龄");
    const currentWeight = positiveNumber(body.currentWeight, "当前体重");
    const targetWeight = positiveNumber(body.targetWeight, "目标体重");
    const gender = ["male", "female", "other"].includes(body.gender ?? "") ? body.gender! : "other";
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const id = await transaction(async client => {
      const existing = await client.query("select 1 from fitfuel.app_user where lower(email)=$1", [email]);
      if (existing.rowCount) throw new ApiError(409, "该邮箱已存在");
      const user = await client.query(
        `insert into fitfuel.app_user
         (email,display_name,password_hash,role,must_change_password,created_by)
         values($1,$2,$3,'user',true,$4) returning id`,
        [email, displayName, passwordHash, admin.id]
      );
      const userId = Number(user.rows[0].id);
      await client.query(
        `insert into fitfuel.user_profile
         (user_id,height_cm,age,gender,initial_weight_kg,target_weight_kg)
         values($1,$2,$3,$4,$5,$6)`,
        [userId, height, age, gender, currentWeight, targetWeight]
      );
      await client.query(
        `insert into fitfuel.nutrition_goal
         (user_id,goal_type,calories_kcal,protein_g,carbohydrate_g,fat_g,water_ml)
         values($1,'cut',1800,110,200,60,2000)`,
        [userId]
      );
      return userId;
    });
    return NextResponse.json({ user: { id, email, displayName }, temporaryPassword }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
