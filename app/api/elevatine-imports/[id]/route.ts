import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, readJson } from "@/lib/http";
import { getBatchReview, patchBatch, type BatchPatch } from "@/lib/elevatine-import";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await getBatchReview(BigInt(id), user.id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    await patchBatch(BigInt(id), user.id, await readJson<BatchPatch>(request));
    return NextResponse.json(await getBatchReview(BigInt(id), user.id));
  } catch (error) {
    return jsonError(error);
  }
}
