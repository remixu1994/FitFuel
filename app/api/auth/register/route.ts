import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "公开注册已关闭，请联系管理员创建账号", code: "REGISTRATION_CLOSED" },
    { status: 403 }
  );
}
