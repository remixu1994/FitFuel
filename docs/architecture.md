# 架构设计

## 总体架构

FitFuel 采用 Next.js App Router 全栈架构，前后端代码在同一项目中，通过 API Routes 提供后端服务。

```
┌─────────────────────────────────────────────────────┐
│                    浏览器客户端                       │
│              (React 19 + CSS)                        │
├──────────────┬──────────────┬───────────────────────┤
│   页面路由    │   API 调用    │   中间件(路由守卫)     │
│  (App Router) │  (fetch API) │  (middleware.ts)      │
├──────────────┴──────────────┴───────────────────────┤
│                  Next.js Server                      │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Pages  │  │ API Routes│  │  Service Layer     │  │
│  │ (app/)  │  │ (app/api/)│  │  (lib/)            │  │
│  └─────────┘  └──────────┘  └────────────────────┘  │
├─────────────────────────────────────────────────────┤
│              Prisma ORM (lib/db.ts)                  │
│         多 schema: fitfuel / food_info / sport       │
├─────────────────────────────────────────────────────┤
│                 PostgreSQL                            │
├─────────────────────────────────────────────────────┤
│              外部服务                                  │
│  MiMo AI (文本+视觉)  │  COROS API  │  Sharp 图片处理 │
└─────────────────────────────────────────────────────┘
```

## 目录结构

```
FitFuel/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 根布局
│   ├── page.tsx                  # 首页（今日饮食）
│   ├── globals.css               # 全局样式
│   ├── login/                    # 登录页
│   ├── register/                 # 注册页（已重定向至登录）
│   ├── change-password/          # 修改密码页
│   ├── admin/                    # 管理员后台
│   ├── records/                  # 饮食记录列表页
│   ├── stats/                    # 营养分析与数据导入导出
│   │   ├── page.tsx
│   │   └── DataTransferDrawers.tsx
│   ├── settings/                 # 设置中心（个人资料/目标/私人食品/回收站）
│   ├── activity/                 # 运动消耗页面
│   │   ├── page.tsx
│   │   └── history/
│   ├── sync/
│   │   └── elevatine/            # Elavatine 图片同步页面
│   └── api/                      # API Routes
│       ├── auth/                 # 认证（登录/登出/会话/注册/改密）
│       ├── admin/                # 管理员（用户管理/AI食品搜索/AI导入）
│       ├── foods/                # 食品搜索
│       ├── meals/                # 餐食管理（增删改/AI估算）
│       ├── daily-records/        # 每日记录（查询/修改/热量来源/活动）
│       ├── records/              # 饮食记录聚合
│       ├── custom-foods/         # 私人食品（CRUD/图片识别）
│       ├── water/                # 饮水记录
│       ├── goals/                # 营养目标
│       ├── profile/              # 个人资料
│       ├── trash/                # 回收站
│       ├── stats/                # 统计数据
│       ├── data-imports/         # 每日数据导入（预览/提交/撤销/模板）
│       ├── data-exports/         # 统计数据导出
│       ├── elevatine-imports/    # Elavatine 图片同步（上传/解析/审核/提交/撤销）
│       ├── coros/                # COROS 运动同步（连接测试/同步/活动历史）
│       └── activity-periods/     # 活动消耗期间总量
├── components/
│   └── AppSidebar.tsx            # 全局侧边栏导航
├── lib/                          # 服务层核心模块
│   ├── db.ts                     # Prisma 客户端 + Raw SQL 适配器
│   ├── auth.ts                   # 会话认证与权限
│   ├── http.ts                   # API 错误处理与工具函数
│   ├── client.ts                 # 浏览器端 API 客户端
│   ├── constants.ts              # 常量（Cookie 名等）
│   ├── nutrition.ts              # 营养计算引擎（BMR/TEF/TDEE）
│   ├── meals.ts                  # 餐食业务逻辑
│   ├── mimo.ts                   # MiMo 文本 AI（食品搜索/份量估算）
│   ├── mimo-vision.ts            # MiMo 视觉 AI（截图解析）
│   ├── ai-config.ts              # AI 环境变量配置
│   ├── ai-candidate.ts           # AI 候选 HMAC 签名
│   ├── food-validation.ts        # 食品数据校验
│   ├── elevatine-types.ts        # Elavatine 类型定义
│   ├── elevatine-storage.ts      # Elavatine 图片存储（Sharp处理）
│   ├── elevatine-import.ts       # Elavatine 导入流程
│   ├── daily-data-file.ts        # Excel/CSV 解析与模板生成
│   ├── coros.ts                  # COROS API 客户端
│   └── coros-sync.ts             # COROS 数据同步引擎
├── database/
│   └── migrations/               # SQL 迁移文件（000-009）
├── prisma/
│   └── schema.prisma             # Prisma schema（反向生成，三 schema）
├── scripts/                      # 工具脚本
├── middleware.ts                  # 路由守卫中间件
├── package.json
├── tsconfig.json
└── next-env.d.ts
```

## 请求流转

### 页面请求

```
浏览器 → middleware.ts → 检查 session cookie
  ├─ 无 session + 非公开路径 → 重定向 /login?next=原路径
  ├─ 有 session + /login → 重定向 /
  ├─ /register → 重定向 /login（注册已关闭）
  └─ 通过 → Next.js 渲染页面（客户端组件 fetch API）
```

### API 请求

```
浏览器 fetch → API Route → requireUser()/requireAdmin()
  ├─ 401: 未登录
  ├─ 403: 需改密 / 需管理员
  └─ 通过 → Service Layer (lib/) → Prisma/db → PostgreSQL
                                            → MiMo AI / COROS API
```

## 认证流程

```
登录:
  POST /api/auth/login
    → 校验邮箱+密码 (argon2 verify)
    → createSession(userId)
    → 生成随机 token (32 bytes base64url)
    → SHA-256 哈希后存入 auth_session 表
    → 设置 httpOnly Cookie (30天有效期)

请求:
  Cookie: fitfuel_session=<token>
    → getCurrentUser()
    → 按 token_hash 查 auth_session
    → 检查过期时间 + 用户状态
    → 返回 SessionUser { id, email, displayName, role, mustChangePassword }

权限:
  requireUser()      → 必须登录 + 不在强制改密状态
  requireAdmin()     → requireUser() + role === "admin"
```

### 安全设计

- **公开注册已关闭**：`/register` 路由被中间件重定向至 `/login`，注册 API 仅管理员可用
- **强制改密**：新用户 `must_change_password = true`，除改密 API 外所有业务 API 返回 403
- **会话安全**：httpOnly + sameSite=lax + secure（生产环境），token 仅存 SHA-256 哈希
- **AI 候选防篡改**：AI 返回的食品候选使用 HMAC-SHA256 签名，客户端不可篡改营养数据
- **同源校验**：写操作 API 校验 Origin 头

## 前端架构

### 客户端组件模式

所有页面均为 `"use client"` 组件，通过 `lib/client.ts` 的 `api()` 函数调用后端 API：

```typescript
// lib/client.ts
async function api<T>(url: string, options?: RequestInit): Promise<T>
// - 自动 JSON 序列化
// - 403 PASSWORD_CHANGE_REQUIRED 自动跳转改密页
// - 统一错误抛出 ApiClientError
```

### 日期处理

所有业务日期使用 `Asia/Shanghai` 时区，通过 `chinaDate()` 和 `shiftDate()` 函数处理：

```typescript
chinaDate()  // → "2026-07-28"（上海时区当日）
shiftDate("2026-07-28", -1)  // → "2026-07-27"
```

### 竞态防护

食品搜索使用请求序号（`useRef` 递增）防止旧响应覆盖新结果：

```typescript
const sequence = ++foodSearchSequence.current;
const result = await api(...);
if (sequence !== foodSearchSequence.current) return; // 废弃过期响应
```

## 数据层架构

### Prisma + Raw SQL 混合模式

FitFuel 使用 Prisma ORM 但保留了大量原生 SQL，原因：

1. **Prisma Client** — 用于简单 CRUD（会话管理、Elavatine 审核流程、COROS 同步）
2. **Raw SQL（PrismaQueryClient）** — 用于复杂查询（食品搜索 UNION、每日记录聚合、advisory lock、统计计算）

`lib/db.ts` 中的 `PrismaQueryClient` 封装了 Prisma 的 `$queryRawUnsafe` / `$executeRawUnsafe`，提供与原 `pg.Pool` 兼容的 `{ rows, rowCount }` 接口，使迁移前后的业务代码无需改动。

### 事务

```typescript
import { transaction } from "@/lib/db";

await transaction(async (client) => {
  // client 是 PrismaQueryClient，支持 query() 方法
  await client.query("insert into ...", [...]);
  await client.query("update ...", [...]);
});
```

Prisma 事务超时为 15 秒；Elavatine 提交和撤销使用 30 秒超时；COROS 同步使用 60 秒超时。
