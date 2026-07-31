import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CorosError, loginToCoros, maskedCorosAccount } from "@/lib/coros";
import { assertSameOrigin, jsonError } from "@/lib/http";
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
