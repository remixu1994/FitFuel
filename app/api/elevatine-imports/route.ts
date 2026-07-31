import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, assertSameOrigin, jsonError } from "@/lib/http";
import {
  MAX_BATCH_BYTES,
  MAX_IMAGE_COUNT,
  storeElevatineImage
} from "@/lib/elevatine-storage";
import { cleanupExpiredElevatineImages } from "@/lib/elevatine-import";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    await cleanupExpiredElevatineImages();
    const batches = await prisma.elevatine_import_batch.findMany({
      where: { user_id: BigInt(user.id) },
      orderBy: { created_at: "desc" },
      take: 30,
      include: {
        _count: { select: { elevatine_import_day: true, elevatine_import_image: true } }
      }
    });
    return NextResponse.json({
      batches: batches.map(batch => ({
        id: batch.id.toString(),
        status: batch.status,
        defaultYear: batch.default_year,
        imageCount: batch._count.elevatine_import_image,
        dayCount: batch._count.elevatine_import_day,
        createdAt: batch.created_at,
        committedAt: batch.committed_at
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const files = form.getAll("images").filter((entry): entry is File => entry instanceof File);
    const defaultYear = Number(form.get("defaultYear"));
    if (!Number.isInteger(defaultYear) || defaultYear < 2000 || defaultYear > 2100) {
      throw new ApiError(400, "默认年份无效");
    }
    if (!files.length || files.length > MAX_IMAGE_COUNT) {
      throw new ApiError(400, `每批需要 1 至 ${MAX_IMAGE_COUNT} 张图片`);
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
      throw new ApiError(400, "单批图片总大小不能超过 80 MB");
    }
    const batch = await prisma.elevatine_import_batch.create({
      data: {
        user_id: BigInt(user.id),
        default_year: defaultYear,
        image_count: files.length
      }
    });
    const hashes = new Set<string>();
    let storedCount = 0;
    try {
      for (const file of files) {
        const stored = await storeElevatineImage(batch.id, file);
        if (hashes.has(stored.sha256)) continue;
        hashes.add(stored.sha256);
        await prisma.elevatine_import_image.create({
          data: {
            batch_id: batch.id,
            file_name: file.name.slice(0, 255),
            storage_key: stored.storageKey,
            sha256: stored.sha256,
            mime_type: stored.mimeType,
            size_bytes: stored.sizeBytes
          }
        });
        storedCount++;
      }
      await prisma.elevatine_import_batch.update({
        where: { id: batch.id },
        data: { image_count: storedCount }
      });
    } catch (error) {
      await prisma.elevatine_import_batch.delete({ where: { id: batch.id } });
      throw error;
    }
    return NextResponse.json({ id: batch.id.toString(), imageCount: storedCount }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
