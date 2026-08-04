import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { CorosError, loginToCoros, maskedCorosAccount } from "@/server/coros";
import { assertSameOrigin, jsonError } from "@/server/http";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const session = await loginToCoros();
    return NextResponse.json({
      connected: true,
      account: maskedCorosAccount(),
      corosUserId: session.userId,
      regionId: session.regionId ?? null
    });
  } catch (error) {
    if (error instanceof CorosError) {
      return NextResponse.json(
        { connected: false, error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return jsonError(error);
  }
}
