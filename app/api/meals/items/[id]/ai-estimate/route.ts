import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { estimateFoodPortionWithMimo } from "@/lib/mimo";
import { ApiError, assertSameOrigin, jsonError, positiveNumber } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = positiveNumber((await params).id, "记录 ID");
    const item = await prisma.meal_item.findFirst({
      where: {
        id: BigInt(id),
        deleted_at: null,
        meal: {
          deleted_at: null,
          daily_record: { user_id: BigInt(user.id), deleted_at: null }
        }
      },
      select: {
        food_name_snapshot: true,
        quantity: true,
        unit: true
      }
    });
    if (!item) throw new ApiError(404, "餐食记录不存在");
    const estimate = await estimateFoodPortionWithMimo(
      item.food_name_snapshot,
      Number(item.quantity),
      item.unit
    );
    return NextResponse.json({ estimate });
  } catch (error) {
    return jsonError(error);
  }
}
