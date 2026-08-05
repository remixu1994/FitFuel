import argon2 from "argon2";
import { NextResponse } from "next/server";
import { createMobileSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { ApiError, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{email?: string; password?: string; deviceName?: string}>(request);
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.password) throw new ApiError(400, "请输入邮箱和密码");
    const user = await prisma.app_user.findFirst({where: {email: {equals: email, mode: "insensitive"}, status: 1}});
    if (!user?.password_hash || !(await argon2.verify(user.password_hash, body.password))) throw new ApiError(401, "邮箱或密码错误");
    await prisma.app_user.update({where: {id: user.id}, data: {last_login_at: new Date()}});
    const session = await createMobileSession(Number(user.id), body.deviceName?.trim() || "FitFuel Android");
    return NextResponse.json({accessToken: session.accessToken, refreshToken: session.refreshToken, accessExpiresAt: session.accessExpiresAt, refreshExpiresAt: session.refreshExpiresAt, user: {id: Number(user.id), email: user.email, displayName: user.display_name, role: user.role, mustChangePassword: user.must_change_password}});
  } catch (error) { return jsonError(error); }
}
