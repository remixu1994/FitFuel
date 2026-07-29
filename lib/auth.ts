import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/constants";

const SESSION_DAYS = 30;

function useSecureCookie() {
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === "true";
  }
  return process.env.NODE_ENV === "production";
}

export type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.auth_session.create({
    data: {
      user_id: BigInt(userId),
      token_hash: hashToken(token),
      expires_at: expiresAt
    }
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie(),
    path: "/",
    expires: expiresAt
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.auth_session.deleteMany({
      where: { token_hash: hashToken(token) }
    });
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.auth_session.findUnique({
    where: { token_hash: hashToken(token) },
    include: { app_user: true }
  });
  if (!session || session.expires_at <= new Date() || session.app_user.status !== 1) return null;
  const row = session.app_user;
  return {
    id: Number(row.id),
    email: row.email ?? "",
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: row.must_change_password
  };
}

export async function requireUser(options: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录");
  if (user.mustChangePassword && !options.allowPasswordChange) {
    throw new ApiError(403, "请先修改临时密码", "PASSWORD_CHANGE_REQUIRED");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new ApiError(403, "需要管理员权限", "ADMIN_REQUIRED");
  return user;
}
