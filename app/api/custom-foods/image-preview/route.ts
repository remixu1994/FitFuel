import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/auth";
import { ApiError, assertSameOrigin, jsonError } from "@/lib/http";
import { parseElevatineImage } from "@/lib/mimo-vision";

const MAX_BYTES = 10 * 1024 * 1024;

function validateImage(buffer: Buffer) {
  const jpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!jpeg && !png && !webp) {
    throw new ApiError(400, "仅支持真实的 JPEG、PNG 或 WebP 图片");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser();
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new ApiError(400, "请选择食品详情图片");
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new ApiError(400, "图片不能为空且不能超过 10 MB");
    }

    const original = Buffer.from(await file.arrayBuffer());
    validateImage(original);
    const normalized = await sharp(original)
      .rotate()
      .resize({ width: 2048, height: 4096, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const parsed = await parseElevatineImage(normalized);
    if (parsed.kind !== "detail") {
      throw new ApiError(422, "未识别为食品详情图，请上传包含食品名称、份量和营养数据的页面");
    }

    const food = parsed.food;
    const quantity = food.quantity ?? 100;
    const unit = food.unit || "g";
    return NextResponse.json({
      candidate: {
        name: food.name,
        brand: "",
        serving_name: `${quantity}${unit}`,
        gram_weight: quantity,
        quantity,
        unit,
        calories: food.calories,
        carbohydrate: food.carbohydrate,
        protein: food.protein,
        fat: food.fat,
        dietary_fiber: 0,
        confidence: food.confidence,
        missingFields: [
          ...(food.carbohydrate == null ? ["carbohydrate"] : []),
          ...(food.protein == null ? ["protein"] : []),
          ...(food.fat == null ? ["fat"] : [])
        ]
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
