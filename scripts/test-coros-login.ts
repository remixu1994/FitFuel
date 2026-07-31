import { loginToCoros, maskedCorosAccount, queryCorosActivities } from "../lib/coros";

async function main() {
  const session = await loginToCoros();
  const activities = await queryCorosActivities(session, {
    startDay: "20260101",
    endDay: "20261231",
    pageNumber: 1,
    size: 1
  });
  console.log(JSON.stringify({
    connected: true,
    account: maskedCorosAccount(),
    userId: session.userId,
    activityCount2026: activities.count,
    sample: activities.dataList.map(activity => ({
      labelId: activity.labelId,
      date: activity.date,
      name: activity.name,
      calorie: activity.calorie
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "COROS 登录测试失败");
  process.exitCode = 1;
});
