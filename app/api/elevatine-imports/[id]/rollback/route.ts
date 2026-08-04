import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { assertSameOrigin, jsonError } from "@/server/http";
import { rollbackBatch } from "@/server/elevatine-import";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    await rollbackBatch(BigInt(id), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
