import { prisma } from "../../src/server/db";

async function main() {
  const admin = await prisma.app_user.findFirstOrThrow({
    where: { role: "admin", status: 1 },
    orderBy: { id: "asc" }
  });
  const records = await prisma.daily_record.findMany({
    where: {
      user_id: admin.id,
      record_date: {
        gte: new Date("2026-06-15T00:00:00.000Z"),
        lte: new Date("2026-07-28T00:00:00.000Z")
      },
      deleted_at: null
    },
    orderBy: { record_date: "asc" }
  });
  const incomplete = records.filter(record =>
    record.elevatine_carbohydrate == null
    || record.elevatine_protein == null
    || record.elevatine_fat == null
    || record.macro_source !== "elevatine"
  );
  const sourceMismatch = records.filter(record =>
    record.calories_source !== "elevatine"
    || record.calories_consumed !== record.elevatine_calories
  );
  const batches = await prisma.elevatine_import_batch.findMany({
    where: { id: { in: [BigInt(1), BigInt(2), BigInt(3)] } },
    select: { id: true, status: true, image_count: true, committed_at: true }
  });
  console.log(JSON.stringify({
    admin: admin.email,
    range: records.length ? [
      records[0].record_date.toISOString().slice(0, 10),
      records.at(-1)!.record_date.toISOString().slice(0, 10)
    ] : [],
    recordCount: records.length,
    incompleteMacroDates: incomplete.map(record => record.record_date.toISOString().slice(0, 10)),
    sourceMismatchDates: sourceMismatch.map(record => record.record_date.toISOString().slice(0, 10)),
    july9: records.find(record => record.record_date.toISOString().startsWith("2026-07-09"))
      ? {
          calories: records.find(record => record.record_date.toISOString().startsWith("2026-07-09"))!.calories_consumed,
          carbohydrate: Number(records.find(record => record.record_date.toISOString().startsWith("2026-07-09"))!.elevatine_carbohydrate),
          protein: Number(records.find(record => record.record_date.toISOString().startsWith("2026-07-09"))!.elevatine_protein),
          fat: Number(records.find(record => record.record_date.toISOString().startsWith("2026-07-09"))!.elevatine_fat)
        }
      : null,
    batches: batches.map(batch => ({
      id: batch.id.toString(),
      status: batch.status,
      images: batch.image_count,
      committedAt: batch.committed_at
    }))
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
