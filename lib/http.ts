import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({
    error: "服务器暂时无法处理请求",
    ...(process.env.NODE_ENV === "development" && error instanceof Error
      ? { detail: error.message }
      : {})
  }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new ApiError(400, "请求数据格式无效");
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expectedHost = request.headers.get("x-forwarded-host")
    ?? request.headers.get("host")
    ?? new URL(request.url).host;
  if (new URL(origin).host !== expectedHost) throw new ApiError(403, "请求来源无效");
}

export function positiveNumber(value: unknown, field: string, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new ApiError(400, `${field}格式无效`);
  }
  return number;
}
