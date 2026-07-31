import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncCorosActivities } from "@/lib/coros-sync";
import { ApiError, assertSameOrigin, jsonError, readJson } from "@/lib/http";

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
