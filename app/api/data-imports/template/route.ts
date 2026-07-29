import { requireUser } from "@/lib/auth";
import { buildDailyDataTemplate } from "@/lib/daily-data-file";
import { ApiError, jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
    const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
    if (format !== "xlsx" && format !== "csv") throw new ApiError(400, "模板格式无效");
    const data = await buildDailyDataTemplate(format);
    const bytes = format === "csv"
      ? Buffer.concat([Buffer.from("\uFEFF"), Buffer.from(data)])
      : Buffer.from(data);
    return new Response(bytes, {
      headers: {
        "Content-Type": format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fitfuel-daily-template.${format}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
