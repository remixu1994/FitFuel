import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, numbers } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await db.query(
      `select u.email, u.display_name, p.height_cm, p.age, p.gender,
              p.initial_weight_kg, p.target_weight_kg, p.activity_level, p.timezone
       from fitfuel.app_user u join fitfuel.user_profile p on p.user_id = u.id
       where u.id = $1`,
      [user.id]
    );
    return NextResponse.json({ profile: numbers(result.rows[0]) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) throw new ApiError(400, "昵称不能为空");
    const height = positiveNumber(body.height, "身高");
    const age = positiveNumber(body.age, "年龄");
    const initialWeight = positiveNumber(body.initialWeight, "初始体重");
    const targetWeight = positiveNumber(body.targetWeight, "目标体重");
    const gender = String(body.gender);
    if (!["male", "female", "other"].includes(gender)) throw new ApiError(400, "性别无效");
    await db.query("update fitfuel.app_user set display_name=$2, updated_at=now() where id=$1", [user.id, displayName]);
    await db.query(
      `update fitfuel.user_profile set height_cm=$2, age=$3, gender=$4,
       initial_weight_kg=$5, target_weight_kg=$6, updated_at=now() where user_id=$1`,
      [user.id, height, age, gender, initialWeight, targetWeight]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
