import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db, prisma, transaction } from "@/server/db";
import { ApiError } from "@/server/http";
import { SESSION_COOKIE } from "@/server/constants";

const SESSION_DAYS = 30;
const MOBILE_ACCESS_MINUTES = 15;
const MOBILE_REFRESH_DAYS = 30;

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

function newToken() { return randomBytes(32).toString("base64url"); }

async function bearerToken() {
  const value = (await headers()).get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

export async function createMobileSession(userId: number, deviceName = "FitFuel Android") {
  const accessToken = newToken();
  const refreshToken = newToken();
  const accessExpiresAt = new Date(Date.now() + MOBILE_ACCESS_MINUTES * 60_000);
  const refreshExpiresAt = new Date(Date.now() + MOBILE_REFRESH_DAYS * 86_400_000);
  await db.query(`insert into fitfuel.mobile_auth_session(user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at,device_name) values($1,$2,$3,$4,$5,$6)`, [userId, hashToken(accessToken), hashToken(refreshToken), accessExpiresAt, refreshExpiresAt, deviceName]);
  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt };
}

export async function refreshMobileSession(refreshToken: string) {
  const result = await transaction(async client => {
    const found = await client.query<{user_id: string}>(`select user_id from fitfuel.mobile_auth_session where refresh_token_hash=$1 and revoked_at is null and refresh_expires_at>now() limit 1`, [hashToken(refreshToken)]);
    if (!found.rowCount) throw new ApiError(401, "Refresh Token 已失效", "SESSION_EXPIRED");
    const userId = Number(found.rows[0].user_id);
    await client.query(`update fitfuel.mobile_auth_session set revoked_at=now(),last_seen_at=now() where refresh_token_hash=$1`, [hashToken(refreshToken)]);
    const accessToken = newToken();
    const nextRefreshToken = newToken();
    const accessExpiresAt = new Date(Date.now() + MOBILE_ACCESS_MINUTES * 60_000);
    const refreshExpiresAt = new Date(Date.now() + MOBILE_REFRESH_DAYS * 86_400_000);
    await client.query(`insert into fitfuel.mobile_auth_session(user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at) values($1,$2,$3,$4,$5)`, [userId, hashToken(accessToken), hashToken(nextRefreshToken), accessExpiresAt, refreshExpiresAt]);
    return { userId, accessToken, refreshToken: nextRefreshToken, accessExpiresAt, refreshExpiresAt };
  });
  return result;
}

export async function revokeMobileSession() {
  const token = await bearerToken();
  if (token) await db.query(`update fitfuel.mobile_auth_session set revoked_at=now(),last_seen_at=now() where access_token_hash=$1 and revoked_at is null`, [hashToken(token)]);
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
  const bearer = await bearerToken();
  if (bearer) {
    const result = await db.query<{id: string; email: string | null; display_name: string; role: string; must_change_password: boolean}>(`select u.id,u.email,u.display_name,u.role,u.must_change_password from fitfuel.mobile_auth_session s join fitfuel.app_user u on u.id=s.user_id where s.access_token_hash=$1 and s.revoked_at is null and s.access_expires_at>now() and u.status=1 limit 1`, [hashToken(bearer)]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return { id: Number(row.id), email: row.email ?? "", displayName: row.display_name, role: row.role, mustChangePassword: row.must_change_password };
  }
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
