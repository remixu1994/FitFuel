import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDailyDataFile } from "@/lib/daily-data-file";
import { ApiError, assertSameOrigin, jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择导入文件");
    const [{ format, rows }, bytes] = await Promise.all([
      parseDailyDataFile(file),
      file.arrayBuffer()
    ]);
    const dates = rows.map(row => new Date(`${row.date}T00:00:00.000Z`));
    const existing = await prisma.daily_record.findMany({
      where: { user_id: BigInt(user.id), record_date: { in: dates }, deleted_at: null },
      select: {
        record_date: true, weight_kg: true, activity_calories: true,
        calories_consumed: true, calories_source: true, meal_calories: true,
        manual_calories: true, imported_calories: true
      }
    });
    const byDate = new Map(existing.map(record => [record.record_date.toISOString().slice(0, 10), record]));
    const batch = await prisma.daily_data_import_batch.create({
      data: {
        user_id: BigInt(user.id),
        file_name: file.name.slice(0, 255),
        file_format: format,
        file_sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
        row_count: rows.length,
        daily_data_import_row: {
          create: rows.map(row => ({
            record_date: new Date(`${row.date}T00:00:00.000Z`),
            imported_calories: row.calories,
            imported_activity_calories: row.activityCalories,
            imported_weight_kg: row.weight
          }))
        }
      }
    });
    return NextResponse.json({
      batch: {
        id: Number(batch.id),
        fileName: batch.file_name,
        format,
        rowCount: rows.length,
        expiresAt: batch.expires_at
      },
      rows: rows.map(row => {
        const current = byDate.get(row.date);
        const availableSources = [
          ...(current && current.meal_calories > 0 ? ["meals"] : []),
          ...(current?.manual_calories !== null && current?.manual_calories !== undefined ? ["manual"] : []),
          "import"
        ];
        return {
          ...row,
          current: current ? {
            weight: current.weight_kg === null ? null : Number(current.weight_kg),
            activityCalories: Number(current.activity_calories),
            calories: current.calories_consumed,
            source: current.calories_source,
            mealCalories: current.meal_calories,
            manualCalories: current.manual_calories,
            importedCalories: current.imported_calories
          } : null,
          availableSources,
          conflicts: {
            intake: Boolean(current && current.calories_consumed !== row.calories),
            weight: Boolean(current?.weight_kg !== null && current?.weight_kg !== undefined && Number(current.weight_kg) !== row.weight),
            activity: Boolean(current && Number(current.activity_calories) !== row.activityCalories)
          }
        };
      })
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
