import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    await prisma.daily_data_import_batch.deleteMany({
      where: { user_id: BigInt(user.id), status: "preview", expires_at: { lt: new Date() } }
    });
    const batches = await prisma.daily_data_import_batch.findMany({
      where: { user_id: BigInt(user.id) },
      orderBy: { created_at: "desc" },
      take: 50
    });
    return NextResponse.json({
      batches: batches.map(batch => ({
        id: Number(batch.id),
        fileName: batch.file_name,
        format: batch.file_format,
        status: batch.status,
        rowCount: batch.row_count,
        createdAt: batch.created_at,
        committedAt: batch.committed_at,
        rolledBackAt: batch.rolled_back_at,
        expiresAt: batch.expires_at
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}
