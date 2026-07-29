import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, readJson } from "@/lib/http";
import { getBatchReview, parseBatch } from "@/lib/elevatine-import";

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
