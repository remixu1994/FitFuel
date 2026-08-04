import { prisma } from "./prisma-client.mjs";

try {
  const users = await prisma.app_user.findMany({
    where: { email: { startsWith: "fitfuel-smoke-" } },
    select: { id: true, email: true }
  });
  await prisma.app_user.deleteMany({
    where: { id: { in: users.map(user => user.id) } }
  });
  console.log(JSON.stringify({
    deletedUsers: users.map(user => ({ id: Number(user.id), email: user.email }))
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
