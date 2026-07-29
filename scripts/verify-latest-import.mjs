import { prisma } from "./prisma-client.mjs";

const fileName = process.argv[2];
const date = process.argv[3];
const batch = await prisma.daily_data_import_batch.findFirst({
  where: { status: "committed", ...(fileName ? { file_name: fileName } : {}) },
  orderBy: { committed_at: "desc" }
});
if (!batch) throw new Error("No committed import batch found.");
const record = await prisma.daily_record.findFirst({
  where: {
    user_id: batch.user_id,
    record_date: new Date(`${date}T00:00:00.000Z`),
    deleted_at: null
  }
});
console.log(JSON.stringify({
  batchId: Number(batch.id),
  rows: batch.row_count,
  date,
  activity: Number(record?.activity_calories),
  intake: record?.calories_consumed,
  weight: Number(record?.weight_kg),
  source: record?.calories_source
}));
await prisma.$disconnect();
