import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const id = Number((await context.params).id);
    const body = await readJson<{ status?: number }>(request);
    if (!Number.isInteger(id) || ![0, 1].includes(Number(body.status))) {
      throw new ApiError(400, "账号状态无效");
    }
    if (id === admin.id) throw new ApiError(400, "不能停用当前管理员账号");
    const result = await db.query(
      `update fitfuel.app_user set status=$2,updated_at=now()
       where id=$1 and role='user' returning id`,
      [id, Number(body.status)]
    );
    if (!result.rowCount) throw new ApiError(404, "普通用户不存在");
    if (Number(body.status) === 0) {
      await db.query("delete from fitfuel.auth_session where user_id=$1", [id]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
