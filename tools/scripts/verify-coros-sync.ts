import { prisma } from "../../src/server/db";

async function main() {
  const user = await prisma.app_user.findFirstOrThrow({
    where: { role: "admin", status: 1 },
    orderBy: { id: "asc" },
    select: { id: true }
  });
  const [activityCount, summaries, records] = await Promise.all([
    prisma.coros_activity.count({
      where: { user_id: user.id, deleted_at: null }
    }),
    prisma.coros_daily_summary.findMany({
      where: { user_id: user.id },
      orderBy: { summary_date: "desc" }
    }),
    prisma.daily_record.findMany({
      where: {
        user_id: user.id,
        record_date: { gte: new Date("2026-01-01T00:00:00.000Z") }
      },
      select: {
        record_date: true,
        activity_source: true,
        activity_calories: true,
        coros_activity_calories: true
      }
    })
  ]);
  const recordsByDate = new Map(
    records.map(record => [record.record_date.toISOString().slice(0, 10), record])
  );
  const mismatches = summaries.filter(summary => {
    const date = summary.summary_date.toISOString().slice(0, 10);
    const record = recordsByDate.get(date);
    return !record
      || record.activity_source !== "coros"
      || !record.activity_calories.equals(summary.calories_kcal)
      || !record.coros_activity_calories?.equals(summary.calories_kcal);
  });
  console.log(JSON.stringify({
    activityCount,
    summaryCount: summaries.filter(row => row.activity_count > 0).length,
    mismatches: mismatches.map(row => row.summary_date.toISOString().slice(0, 10)),
    recent: summaries
      .filter(row => row.activity_count > 0)
      .slice(0, 5)
      .map(row => ({
        date: row.summary_date.toISOString().slice(0, 10),
        activityCount: row.activity_count,
        caloriesKcal: Number(row.calories_kcal)
      }))
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "COROS 同步校验失败");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
