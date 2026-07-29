import argon2 from "argon2";
import { NextResponse } from "next/server";
import { createSession, requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser({ allowPasswordChange: true });
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
    if (!body.currentPassword || !body.newPassword) throw new ApiError(400, "请输入当前密码和新密码");
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;
    if (newPassword.length < 12 || newPassword.length > 128) {
      throw new ApiError(400, "新密码长度需为 12–128 位");
    }
    if (currentPassword === newPassword) throw new ApiError(400, "新密码不能与临时密码相同");

    const passwordHash = await transaction(async client => {
      const result = await client.query(
        "select password_hash from fitfuel.app_user where id=$1 and status=1 for update",
        [user.id]
      );
      if (!result.rowCount || !(await argon2.verify(result.rows[0].password_hash, currentPassword))) {
        throw new ApiError(401, "当前密码错误");
      }
      const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
      await client.query(
        `update fitfuel.app_user
         set password_hash=$2,must_change_password=false,password_changed_at=now(),updated_at=now()
         where id=$1`,
        [user.id, hash]
      );
      await client.query("delete from fitfuel.auth_session where user_id=$1", [user.id]);
      return hash;
    });
    if (!passwordHash) throw new ApiError(500, "密码更新失败");
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
