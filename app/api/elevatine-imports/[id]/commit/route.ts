import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { commitBatch } from "@/lib/elevatine-import";

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
