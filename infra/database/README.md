# FitFuel 数据库基础设施

数据库代码集中在本目录，运行时业务仍通过 `src/server/db.ts` 暴露的 Prisma Client 访问。

## Schema 职责

- `fitfuel`：用户、认证会话、餐食、每日记录、目标、导入批次和运动同步数据。
- `food_info`：公共食品目录，只读给业务查询；管理员维护共享食品。
- `sport`：COROS 运动活动及原始同步数据。

## 目录

- `prisma/schema.prisma`：多 schema Prisma 模型定义。
- `migrations/`：按编号执行的幂等 SQL 迁移。
- `scripts/`：数据库初始化、检查和迁移验证脚本。

## 常用命令

```bash
npm run db:generate
npm run db:init
npm run db:verify
npm run db:verify:fitfuel
npm run db:migrate:fitfuel
```

所有 Prisma 命令显式使用 `infra/database/prisma/schema.prisma`。生产环境执行迁移前必须备份数据库并在预发布环境验证，禁止直接执行破坏性 SQL。

## 边界

Next API 和服务层可以使用 Prisma Client 及参数化 Raw SQL；浏览器代码和未来移动端只能调用 API，不得连接 PostgreSQL 或导入 Prisma。
