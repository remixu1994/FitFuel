import { NextResponse } from "next/server";
import { refreshMobileSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { jsonError, readJson, ApiError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{refreshToken?: string}>(request);
    if (!body.refreshToken) throw new ApiError(401, "缺少 Refresh Token", "SESSION_EXPIRED");
    const session = await refreshMobileSession(body.refreshToken);
    const user = await prisma.app_user.findUnique({where: {id: BigInt(session.userId)}});
    if (!user || user.status !== 1) throw new ApiError(401, "账号不可用", "SESSION_EXPIRED");
    return NextResponse.json({accessToken: session.accessToken, refreshToken: session.refreshToken, accessExpiresAt: session.accessExpiresAt, refreshExpiresAt: session.refreshExpiresAt, user: {id: Number(user.id), email: user.email, displayName: user.display_name, role: user.role, mustChangePassword: user.must_change_password}});
  } catch (error) { return jsonError(error); }
}
