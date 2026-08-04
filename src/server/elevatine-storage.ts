import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "@/server/http";

export const MAX_IMAGE_COUNT = 20;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_BYTES = 80 * 1024 * 1024;

function root() {
  return path.resolve(process.env.PRIVATE_UPLOAD_DIR?.trim() || ".private/elevatine-imports");
}

function sniffMime(buffer: Buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  throw new ApiError(400, "仅支持真实的 JPEG、PNG 或 WebP 图片");
}

export async function storeElevatineImage(batchId: bigint, file: File) {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(400, `图片 ${file.name} 超过 10 MB 或为空`);
  }
  const original = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffMime(original);
  const sha256 = createHash("sha256").update(original).digest("hex");
  const folder = path.join(root(), batchId.toString());
  try {
    await mkdir(folder, { recursive: true });
  } catch {
    throw new ApiError(500, `上传目录不可写（${root()}），请检查容器对私有上传目录的权限`);
  }
  const storageKey = `${batchId}/${randomUUID()}.webp`;
  const output = await sharp(original)
    .rotate()
    .resize({ width: 2048, height: 4096, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
  try {
    await writeFile(path.join(root(), storageKey), output);
  } catch {
    throw new ApiError(500, `上传图片写入失败（${root()}），请检查磁盘空间与目录权限`);
  }
  return { storageKey, sha256, mimeType, sizeBytes: output.byteLength };
}

export async function readStoredImage(storageKey: string) {
  const resolved = path.resolve(root(), storageKey);
  if (!resolved.startsWith(`${root()}${path.sep}`)) throw new ApiError(400, "图片路径无效");
  return readFile(resolved);
}

export async function deleteBatchImages(batchId: bigint) {
  await rm(path.join(root(), batchId.toString()), { recursive: true, force: true });
}
