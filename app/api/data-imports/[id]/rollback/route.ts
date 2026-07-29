import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError } from "@/lib/http";

type Snapshot = {
  weight_kg: number | null;
  calories_consumed: number;
  meal_calories: number;
  manual_calories: number | null;
  imported_calories: number | null;
  activity_calories: number;
  bmr: number;
  tef: number;
  tdee: number;
  calorie_balance: number;
  calories_source: string;
  import_batch_id: string | null;
  note: string | null;
  deleted_at: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) throw new ApiError(400, "导入批次无效");
    const batchId = BigInt(id);
    const latest = await prisma.daily_data_import_batch.findFirst({
      where: { user_id: BigInt(user.id), status: "committed" },
      orderBy: { committed_at: "desc" }
    });
    if (!latest || latest.id !== batchId) throw new ApiError(409, "只能撤销最近一次有效导入");
    const batch = await prisma.daily_data_import_batch.findUnique({
      where: { id: batchId },
      include: { daily_data_import_row: true }
    });
    if (!batch) throw new ApiError(404, "导入批次不存在");

    const conflicts: string[] = [];
    for (const row of batch.daily_data_import_row) {
      const current = await prisma.daily_record.findUnique({
        where: { user_id_record_date: { user_id: BigInt(user.id), record_date: row.record_date } }
      });
      if (!current || !row.after_updated_at || current.updated_at.getTime() !== row.after_updated_at.getTime()) {
        conflicts.push(row.record_date.toISOString().slice(0, 10));
      }
    }
    if (conflicts.length) {
      throw new ApiError(409, `这些日期在导入后已被修改，无法自动撤销：${conflicts.join("、")}`, "ROLLBACK_CONFLICT");
    }

    await prisma.$transaction(async tx => {
      for (const row of batch.daily_data_import_row) {
        const current = await tx.daily_record.findUnique({
          where: { user_id_record_date: { user_id: BigInt(user.id), record_date: row.record_date } }
        });
        if (!current) continue;
        if (!row.before_snapshot) {
          await tx.daily_record.update({
            where: { id: current.id },
            data: { deleted_at: new Date(), updated_at: new Date(), import_batch_id: null }
          });
          continue;
        }
        const before = row.before_snapshot as unknown as Snapshot;
        await tx.daily_record.update({
          where: { id: current.id },
          data: {
            weight_kg: before.weight_kg,
            calories_consumed: before.calories_consumed,
            meal_calories: before.meal_calories,
            manual_calories: before.manual_calories,
            imported_calories: before.imported_calories,
            activity_calories: before.activity_calories,
            bmr: before.bmr,
            tef: before.tef,
            tdee: before.tdee,
            calorie_balance: before.calorie_balance,
            calories_source: before.calories_source,
            import_batch_id: before.import_batch_id ? BigInt(before.import_batch_id) : null,
            note: before.note,
            deleted_at: before.deleted_at ? new Date(before.deleted_at) : null,
            updated_at: new Date()
          }
        });
      }
      await tx.daily_data_import_batch.update({
        where: { id: batchId },
        data: { status: "rolled_back", rolled_back_at: new Date(), updated_at: new Date() }
      });
    }, { timeout: 30_000 });

    return NextResponse.json({ ok: true, batchId: Number(batchId) });
  } catch (error) {
    return jsonError(error);
  }
}
