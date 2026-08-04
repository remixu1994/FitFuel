import { File } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/server/db";
import { storeElevatineImage } from "../../src/server/elevatine-storage";
import { commitBatch, getBatchReview, parseBatch } from "../../src/server/elevatine-import";

async function main() {
  const folder = process.argv[2];
  const commitIds = process.argv.find(value => value.startsWith("--commit="))
    ?.slice("--commit=".length).split(",").filter(Boolean);
  const year = Number(process.argv.find(value => value.startsWith("--year="))?.slice(7) || new Date().getFullYear());

  if (!folder) throw new Error("Usage: tsx tools/scripts/import-elevatine-folder.ts <folder> [--year=2026] [--commit=id,id]");
  const admin = await prisma.app_user.findFirst({
  where: { role: "admin", status: 1 },
  orderBy: { id: "asc" }
  });
  if (!admin) throw new Error("No active admin account found.");

  if (commitIds?.length) {
    for (const id of commitIds) {
    const review = await getBatchReview(BigInt(id), Number(admin.id));
    const unresolved = review.unmatched.filter((item: { selected: boolean }) => item.selected);
    if (unresolved.length) throw new Error(`Batch ${id} has ${unresolved.length} unresolved items.`);
    await commitBatch(BigInt(id), Number(admin.id));
    console.log(JSON.stringify({ event: "committed", batchId: id }));
    }
    return;
  }

  const names = (await readdir(folder))
  .filter(name => /\.(jpe?g|png|webp)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  if (!names.length) throw new Error("No supported images found.");

  const batches: string[] = [];
  for (let offset = 0; offset < names.length; offset += 20) {
  const chunk = names.slice(offset, offset + 20);
  const batch = await prisma.elevatine_import_batch.create({
    data: {
      user_id: admin.id,
      default_year: year,
      image_count: chunk.length
    }
  });
  batches.push(batch.id.toString());
  const hashes = new Set<string>();
  let stored = 0;
  for (const name of chunk) {
    const buffer = await readFile(path.join(folder, name));
    const file = new File([buffer], name, { type: "image/jpeg" });
    const image = await storeElevatineImage(batch.id, file as unknown as globalThis.File);
    if (hashes.has(image.sha256)) continue;
    hashes.add(image.sha256);
    await prisma.elevatine_import_image.create({
      data: {
        batch_id: batch.id,
        file_name: name,
        storage_key: image.storageKey,
        sha256: image.sha256,
        mime_type: image.mimeType,
        size_bytes: image.sizeBytes
      }
    });
    stored++;
  }
  await prisma.elevatine_import_batch.update({
    where: { id: batch.id },
    data: { image_count: stored }
  });
  console.log(JSON.stringify({ event: "uploaded", batchId: batch.id.toString(), images: stored }));
  await parseBatch(batch.id, Number(admin.id));
  const review = await getBatchReview(batch.id, Number(admin.id));
  console.log(JSON.stringify({
    event: "parsed",
    batchId: batch.id.toString(),
    status: review.status,
    images: review.elevatine_import_image.map((image: {
      file_name: string; status: string; image_kind: string; error_message: string | null
    }) => ({
      file: image.file_name,
      status: image.status,
      kind: image.image_kind,
      error: image.error_message
    })),
    days: review.elevatine_import_day.map((day: {
      record_date: string; calories: number; carbohydrate: string | number | null;
      protein: string | number | null; fat: string | number | null; warnings: unknown
    }) => ({
      date: String(day.record_date).slice(0, 10),
      calories: day.calories,
      carbohydrate: day.carbohydrate,
      protein: day.protein,
      fat: day.fat,
      warnings: day.warnings
    })),
    unresolved: review.unmatched.length
  }));
  }
  console.log(JSON.stringify({ event: "ready", admin: admin.email, batches }));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
