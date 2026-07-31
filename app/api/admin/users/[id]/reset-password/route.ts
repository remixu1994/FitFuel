import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id === admin.id) throw new ApiError(400, "用户无效");
    const body = await readJson<{ temporaryPassword?: string }>(request);
    const temporaryPassword = body.temporaryPassword || randomBytes(12).toString("base64url");
    if (temporaryPassword.length < 12 || temporaryPassword.length > 128) {
      throw new ApiError(400, "临时密码长度需为 12–128 位");
    }
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await transaction(async client => {
      const result = await client.query(
        `update fitfuel.app_user
         set password_hash=$2,must_change_password=true,password_changed_at=null,updated_at=now()
         where id=$1 and role='user' returning id`,
        [id, passwordHash]
      );
      if (!result.rowCount) throw new ApiError(404, "普通用户不存在");
      await client.query("delete from fitfuel.auth_session where user_id=$1", [id]);
    });
    return NextResponse.json({ temporaryPassword });
  } catch (error) {
    return jsonError(error);
  }
}
