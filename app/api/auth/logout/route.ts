import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth";
import { assertSameOrigin, jsonError } from "@/server/http";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
