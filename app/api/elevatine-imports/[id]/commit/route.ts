import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { assertSameOrigin, jsonError } from "@/server/http";
import { commitBatch } from "@/server/elevatine-import";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await commitBatch(BigInt(id), user.id));
  } catch (error) {
    return jsonError(error);
  }
}
