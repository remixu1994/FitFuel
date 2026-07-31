import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const DEFAULT_API_BASE_URL = "https://teamcnapi.coros.com";
const DEFAULT_TEAM_API_BASE_URL = "https://teamcnapi.coros.com";
const REQUEST_TIMEOUT_MS = 15_000;

type CorosEnvelope<T> = {
  result?: string;
  message?: string;
  data?: T;
};

type CorosLoginData = {
  accessToken?: string;
  userId?: string | number;
  regionId?: string | number;
  twoFactorRequired?: boolean;
};

export type CorosSession = {
  accessToken: string;
  userId: string;
  regionId?: string;
  cookies: string[];
};

export type CorosActivity = Record<string, unknown> & {
  labelId?: string;
  date?: number;
  name?: string;
  calorie?: number;
};

export type CorosActivityPage = {
  count: number;
  dataList: CorosActivity[];
};

export class CorosError extends Error {
  constructor(
    message: string,
    public readonly code = "COROS_REQUEST_FAILED",
    public readonly status = 502
  ) {
    super(message);
  }
}

function apiBaseUrl() {
  return (process.env.COROS_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function teamApiBaseUrl() {
  return (process.env.COROS_TEAM_API_BASE_URL || DEFAULT_TEAM_API_BASE_URL).replace(/\/+$/, "");
}

function requiredCredential(name: "COROS_ACCOUNT" | "COROS_PASSWORD") {
  const value = process.env[name]?.trim();
  if (!value) throw new CorosError(`缺少环境变量 ${name}`, "COROS_NOT_CONFIGURED", 503);
  return value;
}

function corosHeaders(accessToken?: string, userId?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: "https://t.coros.com",
    Referer: "https://t.coros.com/",
    "Accept-Language": "zh-CN,zh;q=0.9",
    YFHeader: JSON.stringify({
      ...(userId ? { userId } : {}),
      language: "zh-CN"
    })
  };
  if (accessToken) headers.AccessToken = accessToken;
  return headers;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CorosError("COROS 请求超时", "COROS_TIMEOUT", 504);
    }
    throw new CorosError("无法连接 COROS 服务");
  } finally {
    clearTimeout(timeout);
  }
}

function passwordPayload(password: string) {
  // COROS Training Hub submits bcrypt(md5(password)) as p1 and the salt as p2.
  const digest = createHash("md5").update(password, "utf8").digest("hex");
  const salt = bcrypt.genSaltSync(10);
  return { p1: bcrypt.hashSync(digest, salt), p2: salt };
}

function responseCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

async function parseEnvelope<T>(response: Response): Promise<CorosEnvelope<T>> {
  let payload: CorosEnvelope<T>;
  try {
    payload = await response.json() as CorosEnvelope<T>;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown";
    throw new CorosError(
      `COROS 返回了无法解析的数据（HTTP ${response.status}, ${contentType}）`
    );
  }
  if (!response.ok) throw new CorosError(`COROS 请求失败（HTTP ${response.status}）`);
  return payload;
}

export async function loginToCoros(credentials?: { account: string; password: string }) {
  const account = credentials?.account?.trim() || requiredCredential("COROS_ACCOUNT");
  const password = credentials?.password || requiredCredential("COROS_PASSWORD");
  const response = await fetchWithTimeout(`${apiBaseUrl()}/account/login`, {
    method: "POST",
    headers: corosHeaders(),
    body: JSON.stringify({
      account,
      accountType: 2,
      ...passwordPayload(password)
    })
  });
  const envelope = await parseEnvelope<CorosLoginData>(response);
  if (envelope.result && envelope.result !== "0000") {
    throw new CorosError(
      envelope.message || `COROS 登录失败（${envelope.result}）`,
      `COROS_${envelope.result}`,
      401
    );
  }

  const data = envelope.data ?? envelope as CorosLoginData;
  if (data.twoFactorRequired) {
    throw new CorosError("COROS 账号已启用二次验证，暂时无法自动登录", "COROS_2FA_REQUIRED", 409);
  }
  if (!data.accessToken || data.userId === undefined || data.userId === null) {
    throw new CorosError("COROS 登录成功响应缺少会话信息");
  }

  return {
    accessToken: data.accessToken,
    userId: String(data.userId),
    regionId: data.regionId === undefined ? undefined : String(data.regionId),
    cookies: responseCookies(response)
  } satisfies CorosSession;
}

export async function queryCorosActivities(
  session: CorosSession,
  options: {
    startDay: string;
    endDay: string;
    pageNumber?: number;
    size?: number;
    modeList?: string;
  }
) {
  if (!/^\d{8}$/.test(options.startDay) || !/^\d{8}$/.test(options.endDay)) {
    throw new CorosError("COROS 日期必须为 YYYYMMDD", "COROS_INVALID_DATE", 400);
  }
  const params = new URLSearchParams({
    size: String(options.size ?? 20),
    pageNumber: String(options.pageNumber ?? 1),
    modeList: options.modeList ?? "",
    startDay: options.startDay,
    endDay: options.endDay
  });
  const headers = corosHeaders(session.accessToken, session.userId);
  if (session.cookies.length) {
    headers.Cookie = session.cookies.map(cookie => cookie.split(";", 1)[0]).join("; ");
  }
  const response = await fetchWithTimeout(`${teamApiBaseUrl()}/activity/query?${params}`, {
    headers
  });
  const envelope = await parseEnvelope<CorosActivityPage>(response);
  if (envelope.result && envelope.result !== "0000") {
    throw new CorosError(
      envelope.message || `COROS 活动查询失败（${envelope.result}）`,
      `COROS_${envelope.result}`,
      502
    );
  }
  if (!envelope.data || !Array.isArray(envelope.data.dataList)) {
    throw new CorosError("COROS 活动响应格式不符合预期");
  }
  return envelope.data;
}

export function maskedCorosAccount() {
  const account = requiredCredential("COROS_ACCOUNT");
  if (account.length <= 7) return `${account.slice(0, 1)}***${account.slice(-1)}`;
  return `${account.slice(0, 3)}****${account.slice(-4)}`;
}
