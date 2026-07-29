import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http";
import type { AiFoodResult } from "@/lib/mimo";

type CandidatePayload = {
  version: 1;
  userId: number;
  expiresAt: number;
  query: string;
  food: AiFoodResult;
};

function secret() {
  const value = process.env.AI_CANDIDATE_SECRET;
  if (!value || value.length < 32) throw new ApiError(503, "AI 候选签名尚未配置");
  return value;
}

function sign(content: string) {
  return createHmac("sha256", secret()).update(content).digest("base64url");
}

export function createCandidateToken(userId: number, query: string, food: AiFoodResult) {
  const payload: CandidatePayload = {
    version: 1,
    userId,
    expiresAt: Date.now() + 10 * 60_000,
    query,
    food
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyCandidateToken(token: string, userId: number) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new ApiError(400, "AI 候选凭证无效");
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError(400, "AI 候选凭证无效");
  }
  let payload: CandidatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CandidatePayload;
  } catch {
    throw new ApiError(400, "AI 候选凭证无效");
  }
  if (payload.version !== 1 || payload.userId !== userId || payload.expiresAt < Date.now()) {
    throw new ApiError(400, "AI 候选已过期，请重新搜索");
  }
  return payload;
}

export function normalizeFoodQuery(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}
