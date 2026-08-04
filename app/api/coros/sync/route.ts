import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { syncCorosActivities } from "@/server/coros-sync";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/server/http";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = await readJson<{ startDate?: string; endDate?: string }>(request);
    const result = await syncCorosActivities(user.id, {
      startDate: body.startDate,
      endDate: body.endDate
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("COROS 同步")) {
      return jsonError(new ApiError(400, error.message));
    }
    return jsonError(error);
  }
}
