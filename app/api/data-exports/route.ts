import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const range = params.get("range") ?? "30d";
    const format = params.get("format") ?? "xlsx";
    if (!["7d", "30d", "90d", "all"].includes(range)) throw new ApiError(400, "导出范围无效");
    if (!["xlsx", "csv"].includes(format)) throw new ApiError(400, "导出格式无效");
    const days = range === "all" ? null : Number(range.slice(0, -1));
    const today = new Date(`${shanghaiDate()}T00:00:00.000Z`);
    const from = days ? new Date(today.getTime() - (days - 1) * 86400000) : null;
    const records = await prisma.daily_record.findMany({
      where: {
        user_id: BigInt(user.id),
        deleted_at: null,
        ...(from ? { record_date: { gte: from } } : {})
      },
      orderBy: { record_date: "asc" }
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("统计数据");
    sheet.addRow([
      "日期", "摄入(kcal)", "摄入来源", "餐食汇总(kcal)", "手工摄入(kcal)", "导入摄入(kcal)",
      "活动消耗(kcal)", "体重(kg)", "基础代谢(kcal)", "食物热效应(kcal)", "总消耗(kcal)", "热量差(kcal)"
    ]);
    const sourceLabels: Record<string,string> = { meals: "餐食汇总", manual: "手工录入", import: "文件导入" };
    for (const record of records) {
      sheet.addRow([
        record.record_date.toISOString().slice(0, 10),
        record.calories_consumed,
        sourceLabels[record.calories_source] ?? record.calories_source,
        record.meal_calories,
        record.manual_calories,
        record.imported_calories,
        record.activity_calories,
        record.weight_kg === null ? null : Number(record.weight_kg),
        Number(record.bmr),
        Number(record.tef),
        Number(record.tdee),
        Number(record.calorie_balance)
      ]);
    }
    sheet.columns = [
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 },
      { width: 18 }, { width: 13 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 16 }
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF178A4B" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const data = format === "xlsx"
      ? await workbook.xlsx.writeBuffer()
      : await workbook.csv.writeBuffer({ encoding: "utf8" });
    const bytes = format === "csv"
      ? Buffer.concat([Buffer.from("\uFEFF"), Buffer.from(data)])
      : Buffer.from(data);
    return new Response(bytes, {
      headers: {
        "Content-Type": format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fitfuel-statistics-${range}.${format}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
