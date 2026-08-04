import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { assertSameOrigin, jsonError, readJson } from "@/server/http";
import { getBatchReview, parseBatch } from "@/server/elevatine-import";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body: { imageId?: string } = await readJson<{ imageId?: string }>(request).catch(() => ({}));
    await parseBatch(BigInt(id), user.id, body.imageId ? BigInt(body.imageId) : undefined);
    return NextResponse.json(await getBatchReview(BigInt(id), user.id));
  } catch (error) {
    return jsonError(error);
  }
}
