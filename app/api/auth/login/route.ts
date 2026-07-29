import argon2 from "argon2";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ email?: string; password?: string }>(request);
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.password) throw new ApiError(400, "请输入邮箱和密码");
    const user = await prisma.app_user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        status: 1
      }
    });
    if (!user?.password_hash || !(await argon2.verify(user.password_hash, body.password))) {
      throw new ApiError(401, "邮箱或密码错误");
    }
    await prisma.app_user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() }
    });
    await createSession(Number(user.id));
    return NextResponse.json({
      user: {
        id: Number(user.id),
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        mustChangePassword: user.must_change_password
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
