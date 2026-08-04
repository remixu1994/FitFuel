import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { ApiError } from "@/server/http";

export type DailyImportRow = {
  date: string;
  calories: number;
  activityCalories: number;
  weight: number;
};

export const dailyDataHeaders = ["日期", "摄入(kcal)", "活动消耗(kcal)", "体重(kg)"] as const;
const maxFileBytes = 5 * 1024 * 1024;
const maxRows = 5000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function cellHasFormula(cell: ExcelJS.Cell) {
  const value = cell.value;
  return Boolean(value && typeof value === "object" && "formula" in value);
}

function dateValue(cell: ExcelJS.Cell, rowNumber: number) {
  if (cellHasFormula(cell)) throw new ApiError(400, `第 ${rowNumber} 行日期不能使用公式`);
  const value = cell.value;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? "").trim();
  if (!datePattern.test(text)) throw new ApiError(400, `第 ${rowNumber} 行日期必须为 YYYY-MM-DD`);
  const parsed = new Date(`${text}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, `第 ${rowNumber} 行日期无效`);
  }
  return text;
}

function numericValue(cell: ExcelJS.Cell, rowNumber: number, label: string, allowZero: boolean) {
  if (cellHasFormula(cell)) throw new ApiError(400, `第 ${rowNumber} 行${label}不能使用公式`);
  const value = typeof cell.value === "number" ? cell.value : Number(String(cell.value ?? "").trim());
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new ApiError(400, `第 ${rowNumber} 行${label}格式无效`);
  }
  return value;
}

export async function parseDailyDataFile(file: File): Promise<{ format: "xlsx" | "csv"; rows: DailyImportRow[] }> {
  const lower = file.name.toLowerCase();
  const format = lower.endsWith(".xlsx") ? "xlsx" : lower.endsWith(".csv") ? "csv" : null;
  if (!format) throw new ApiError(400, "仅支持 .xlsx 或 .csv 文件");
  if (!file.size || file.size > maxFileBytes) throw new ApiError(400, "文件大小必须在 5MB 以内");

  const bytes = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  if (format === "xlsx") {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } else {
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    await workbook.csv.read(Readable.from([text]));
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, "文件中没有可读取的工作表");
  const headers = dailyDataHeaders.map((_, index) => String(sheet.getRow(1).getCell(index + 1).value ?? "").trim());
  if (headers.some((header, index) => header !== dailyDataHeaders[index])) {
    throw new ApiError(400, `表头必须依次为：${dailyDataHeaders.join("、")}`);
  }

  const rows: DailyImportRow[] = [];
  const dates = new Set<string>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
    if (values.every(value => value === null || value === undefined || String(value).trim() === "")) continue;
    if (rows.length >= maxRows) throw new ApiError(400, `单次最多导入 ${maxRows} 行`);
    const date = dateValue(row.getCell(1), rowNumber);
    if (dates.has(date)) throw new ApiError(400, `日期 ${date} 在文件中重复`);
    dates.add(date);
    rows.push({
      date,
      calories: Math.round(numericValue(row.getCell(2), rowNumber, "摄入", true)),
      activityCalories: Math.round(numericValue(row.getCell(3), rowNumber, "活动消耗", true) * 100) / 100,
      weight: Math.round(numericValue(row.getCell(4), rowNumber, "体重", false) * 100) / 100
    });
  }
  if (!rows.length) throw new ApiError(400, "文件中没有可导入的数据");
  return { format, rows };
}

export function buildDailyDataTemplate(format: "xlsx" | "csv") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("每日数据");
  sheet.addRow([...dailyDataHeaders]);
  sheet.addRow(["2026-07-20", 1842, 561, 77.5]);
  sheet.columns = [
    { width: 16 }, { width: 16 }, { width: 20 }, { width: 14 }
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF178A4B" } };
  return format === "xlsx"
    ? workbook.xlsx.writeBuffer()
    : workbook.csv.writeBuffer({ encoding: "utf8" });
}
