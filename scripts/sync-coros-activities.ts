import { prisma } from "../lib/db";
import { syncCorosActivities } from "../lib/coros-sync";

async function main() {
  const configuredEmail = process.env.FITFUEL_ADMIN_EMAIL?.trim().toLowerCase();
  const user = await prisma.app_user.findFirst({
    where: configuredEmail
      ? { email: { equals: configuredEmail, mode: "insensitive" }, role: "admin" }
      : { role: "admin", status: 1 },
    orderBy: { id: "asc" },
    select: { id: true, email: true }
  });
  if (!user) throw new Error("没有找到可同步的 FitFuel 管理员账号");
  const result = await syncCorosActivities(Number(user.id));
  console.log(JSON.stringify({
    user: user.email,
    batchId: result.batchId,
    activityCount: result.activityCount,
    dayCount: result.dayCount,
    totalCalories: result.days.reduce((sum, day) => sum + day.caloriesKcal, 0),
    range: result.days.length
      ? [result.days[0].date, result.days[result.days.length - 1].date]
      : []
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "COROS 活动同步失败");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
