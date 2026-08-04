import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/server/auth";
import { ApiError, assertSameOrigin, jsonError } from "@/server/http";
import { parseElevatineImage } from "@/server/mimo-vision";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

function gramWeightFor(name: string, quantity: number | null, unit: string) {
  if (quantity == null || quantity <= 0) return null;
  const normalized = unit.trim().toLowerCase();
  if (["g", "克", "gram", "grams"].includes(normalized)) return quantity;
  if (["ml", "毫升", "milliliter", "milliliters"].includes(normalized)) {
    const densities: Array<[string[], number]> = [
      [["牛奶", "奶", "酸奶"], 1.03],
      [["果汁", "豆浆", "饮料"], 1.02],
      [["食用油", "橄榄油", "油"], 0.92],
      [["蜂蜜"], 1.42]
    ];
    const density = densities.find(([keywords]) => keywords.some(keyword => name.includes(keyword)))?.[1] ?? 1;
    return Math.round(quantity * density * 100) / 100;
  }
  return quantity;
}

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
    const quantity = food.quantity;
    const unit = food.unit || "g";
    const gramWeight = gramWeightFor(food.name, quantity, unit);
    if (quantity == null || quantity <= 0) throw new ApiError(422, "图片中未识别出有效数量");
    return NextResponse.json({
      candidate: {
        name: food.name,
        brand: "",
        serving_name: `${quantity}${unit}`,
        gram_weight: gramWeight,
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
