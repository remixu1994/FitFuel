import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { enrichBatchNutrition } from "@/server/elevatine-import";
import { assertSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await enrichBatchNutrition(BigInt(id), user.id));
  } catch (error) {
    return jsonError(error);
  }
}
