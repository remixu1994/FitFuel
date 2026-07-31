# 核心模块

本文档详细描述 `lib/` 目录下各核心模块的职责、接口和实现细节。

## db.ts — 数据库访问层

### 职责

封装 Prisma Client，提供与原 `pg.Pool` 兼容的查询接口，支持 Prisma ORM 和原生 SQL 混合使用。

### 导出

```typescript
// Prisma Client 实例（全局单例，开发环境防热重载泄漏）
export const prisma: PrismaClient;

// 兼容 pg 的查询客户端
export const db: PrismaQueryClient;

// 事务封装
export async function transaction<T>(work: (client: PrismaQueryClient) => Promise<T>): Promise<T>;

// 数值规范化（将字符串形式的数字转为 number）
export function numbers<T>(row: T): T;
```

### PrismaQueryClient

```typescript
class PrismaQueryClient {
  async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}
```

内部实现：
- 判断 SQL 是否返回行（SELECT / WITH / RETURNING），选择 `$queryRawUnsafe` 或 `$executeRawUnsafe`
- 自动将对象参数 JSON 序列化（兼容 Prisma 的参数绑定）
- 将 bigint 和 Decimal 转为字符串（兼容旧代码期望）

### 多 Schema 配置

Prisma schema 配置了三个 schema：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["fitfuel", "food_info", "sport"]
}
```

每个 model 通过 `@@schema("fitfuel")` 指定所属 schema。

### 数据库 URL 组装

支持两种配置方式：
1. `DATABASE_URL` 环境变量（优先）
2. 分散的 `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` 环境变量（自动组装）

---

## auth.ts — 认证与权限

### 职责

基于 Cookie 的会话认证，提供用户身份获取和权限校验。

### 核心函数

```typescript
// 创建会话（生成 token，SHA-256 哈希存库，设置 Cookie）
async function createSession(userId: number): Promise<void>;

// 销毁会话
async function destroySession(): Promise<void>;

// 获取当前用户（从 Cookie token 查会话）
async function getCurrentUser(): Promise<SessionUser | null>;

// 要求登录（未登录抛 401，需改密抛 403）
async function requireUser(options?: { allowPasswordChange?: boolean }): Promise<SessionUser>;

// 要求管理员
async function requireAdmin(): Promise<SessionUser>;
```

### SessionUser

```typescript
type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  role: string;           // "user" | "admin"
  mustChangePassword: boolean;
};
```

### 安全设计

- Token：32 字节随机 base64url
- 存储：SHA-256 哈希后存入 `auth_session.token_hash`
- Cookie：httpOnly + sameSite=lax + secure（生产环境）
- 有效期：30 天
- 强制改密：`mustChangePassword = true` 时，除改密 API 外所有业务 API 返回 403

---

## nutrition.ts — 营养计算引擎

### 职责

实现 TDEE 模型计算，包括 BMR、TEF、TDEE、热量差。

### 计算公式

```
BMR (Mifflin-St Jeor):
  男性: BMR = 10 × weight + 6.25 × height - 5 × age + 5
  女性: BMR = 10 × weight + 6.25 × height - 5 × age - 161

TEF (食物热效应):
  TEF = 摄入热量 × 8%

TDEE (每日总消耗):
  TDEE = BMR + 活动消耗 + TEF

热量差:
  CalorieBalance = TDEE - 摄入热量
```

### 核心函数

```typescript
// 纯函数计算代谢值
function calculateMetabolism(weight, intake, activity, profile): { bmr, tef, tdee, calorieBalance };

// 重算每日记录（从数据库读取记录和餐食热量，按 calories_source 选择有效摄入，计算并更新）
async function recalculateDailyRecord(client: PrismaQueryClient, dailyRecordId: number): Promise<void>;
```

### 摄入来源优先级

`recalculateDailyRecord` 中的摄入选择逻辑：

```
if calories_source === "elevatine" && elevatine_calories !== null → 使用 elevatine_calories
else if calories_source === "import" && imported_calories !== null → 使用 imported_calories
else if calories_source === "manual" && manual_calories !== null → 使用 manual_calories
else → 使用 meal_calories（餐食汇总）
```

---

## meals.ts — 餐食业务逻辑

### 职责

封装"向餐次添加食物"的完整流程：创建/复用每日记录 → 创建/复用餐次 → 插入餐食明细 → 触发营养重算。

### 餐次配置

```typescript
const mealNames = {
  breakfast: ["早餐", 1],
  lunch:     ["午餐", 2],
  dinner:    ["晚餐", 3],
  snack:     ["加餐", 4]
};
```

### addFoodToMeal

```typescript
async function addFoodToMeal(client, input: {
  userId, date, mealType, quantity, food: MealFood,
  foodId?, customFoodId?, source: "database" | "user" | "ai"
}): Promise<number>;  // 返回 meal_item.id
```

流程：
1. 验证日期格式和餐次类型
2. `INSERT ... ON CONFLICT DO UPDATE` 创建/恢复每日记录
3. 查找现有餐次，不存在则创建
4. 插入 meal_item（营养值 × 数量作为快照）
5. 调用 `recalculateDailyRecord` 更新每日统计

---

## mimo.ts — MiMo 文本 AI

### 职责

调用 MiMo AI 模型进行食品营养估算，提供两个核心能力：

1. **食品搜索** — 根据食品名称估算标准份量的营养数据
2. **份量估算** — 根据食品名称和实际食用份量估算营养

### searchFoodWithMimo

```typescript
async function searchFoodWithMimo(query: string): Promise<AiFoodResult>;
```

- 系统提示：要求 AI 作为中国食品营养数据专家，返回标准 JSON
- 参数：temperature=0.2, max_tokens=500, response_format=json_object
- 超时：20 秒
- 容错：解析带单位/逗号的数字字符串（如 "165kcal" → 165）
- 校验：热量 0-5000，蛋白质/碳水/脂肪/纤维 0-500

### estimateFoodPortionWithMimo

```typescript
async function estimateFoodPortionWithMimo(name, quantity, unit): Promise<AiPortionEstimate>;
```

- 按实际份量估算（不转换为每 100g）
- 参数：temperature=0.15, max_tokens=500
- 超时：25 秒

### AiFoodResult

```typescript
type AiFoodResult = {
  key: string;            // "ai:estimate"
  name: string;
  brand: string;          // "Mimo AI 估算"
  serving: string;
  gram_weight: number;
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  dietary_fiber: number;
  source: "ai";
  confidence: number;     // 0-1
  reason: string;         // 估算依据
};
```

---

## mimo-vision.ts — MiMo 视觉 AI

### 职责

调用 MiMo 视觉模型解析 Elavatine 营养截图，区分汇总图和详情图。

### parseElevatineImage

```typescript
async function parseElevatineImage(image: Buffer): Promise<ParsedElevatineImage>;
```

- 输入：WebP 格式的图片 Buffer
- 模型：`MIMO_VISION_MODEL`（可选，回退到 `MIMO_MODEL`）
- 温度：0（确定性输出）
- 超时：90 秒
- 输出：严格 JSON，区分 `summary`（每日汇总）和 `detail`（单食品详情）

### ParsedElevatineImage

```typescript
// 汇总图
{ kind: "summary", confidence, year, month, day, calories, carbohydrate, protein, fat,
  caloriesGoal, carbohydrateGoal, proteinGoal, fatGoal,
  meals: [{ label, order, time, calories, ..., foods: [{ name, quantity, unit, calories, ... }] }] }

// 详情图
{ kind: "detail", confidence, food: { name, quantity, unit, calories, ... } }
```

---

## ai-candidate.ts — AI 候选签名

### 职责

使用 HMAC-SHA256 对 AI 返回的食品候选数据签名，防止客户端篡改营养值。

### 流程

```
管理员搜索 → AI 返回候选 → 服务端签名 createCandidateToken() → 返回 candidateToken
管理员确认 → 提交 candidateToken → 服务端验签 verifyCandidateToken() → 校验 userId + 过期时间
```

- 密钥：`AI_CANDIDATE_SECRET` 环境变量（≥32 字符）
- 有效期：10 分钟
- 签名格式：`base64url(payload).base64url(hmac)`

---

## elevatine-import.ts — Elavatine 导入流程

### 职责

完整的 Elavatine 图片同步业务流程：解析 → 审核 → 提交 → 撤销。

### 核心函数

```typescript
// 解析批次中的所有图片
async function parseBatch(batchId, userId, retryImageId?): Promise<void>;

// 获取审核数据
async function getBatchReview(batchId, userId): Promise<...>;

// 修改审核数据（日期选择、食品分配、营养编辑）
async function patchBatch(batchId, userId, patch: BatchPatch): Promise<void>;

// 提交批次（写入餐食和每日记录，删除原始图片）
async function commitBatch(batchId, userId): Promise<...>;

// 撤销批次（恢复 before_snapshot，仅允许撤销最近一次）
async function rollbackBatch(batchId, userId): Promise<void>;

// 清理过期批次的图片
async function cleanupExpiredElevatineImages(): Promise<void>;
```

### 解析流程

1. 逐张图片调用 `parseElevatineImage`（并发限制 3 张）
2. `rebuildReview` — 从汇总图提取日期和食品明细，从详情图匹配补充
3. `enrichMissingBatchItems` — 对缺失营养的食品调用 `estimateFoodPortionWithMimo` 补全

### 提交流程

1. 校验所有选中项已分配日期
2. 事务内：保存 before_snapshot → 软删除旧 elevatine 餐食 → 创建新餐食和明细 → 更新每日记录 → 标记批次已提交
3. 事务外：删除原始图片文件

### 撤销流程

1. 校验是最近一次已提交批次
2. 校验每日记录在同步后未被修改（`after_updated_at` 比对）
3. 事务内：软删除 elevatine 餐食 → 从 before_snapshot 恢复记录和餐食 → 标记批次已撤销

---

## elevatine-storage.ts — 图片存储

### 职责

私有文件系统存储，使用 Sharp 进行图片预处理。

### 限制

- 单图最大：10 MB
- 单批次最大：80 MB
- 单批次最多：20 张
- 支持格式：JPEG / PNG / WebP

### 处理流程

```
原始图片 → MIME 嗅探 → Sharp 处理
  → rotate()           // 自动旋转（EXIF）
  → resize(2048×4096)  // 限制尺寸
  → webp({ quality: 88 })  // 转 WebP
  → 写入文件系统
```

存储路径：`{PRIVATE_UPLOAD_DIR}/{batchId}/{uuid}.webp`

路径安全：`readStoredImage` 校验解析后路径在根目录内，防止目录穿越。

---

## daily-data-file.ts — Excel/CSV 解析

### 职责

解析用户上传的 Excel/CSV 每日数据文件，生成导入模板。

### 文件格式

表头（固定）：`日期 | 摄入(kcal) | 活动消耗(kcal) | 体重(kg)`

### 限制

- 文件大小：5 MB 以内
- 行数：最多 5000 行
- 日期：必须为 `YYYY-MM-DD` 格式，不可使用公式
- 数值：不可使用公式，需为有效正数

### 模板生成

`buildDailyDataTemplate("xlsx" | "csv")` 生成带格式的模板文件（绿色表头、示例行）。

---

## coros.ts — COROS API 客户端

### 职责

封装 COROS Training Hub 的登录和活动查询 API。

### 认证方式

COROS 使用 `bcrypt(md5(password))` 作为密码提交格式：

```typescript
const digest = createHash("md5").update(password, "utf8").digest("hex");
const salt = bcrypt.genSaltSync(10);
const p1 = bcrypt.hashSync(digest, salt);  // 密码哈希
const p2 = salt;                            // 盐值
```

### 核心函数

```typescript
// 登录 COROS
async function loginToCoros(credentials?): Promise<CorosSession>;

// 查询活动列表
async function queryCorosActivities(session, options: {
  startDay: "YYYYMMDD", endDay: "YYYYMMDD", pageNumber?, size?
}): Promise<{ count, dataList }>;

// 获取脱敏账号显示
function maskedCorosAccount(): string;
```

---

## coros-sync.ts — COROS 同步引擎

### 职责

完整的 COROS 活动同步流程：登录 → 分页拉取 → 去重 → 写入数据库 → 更新每日记录。

### syncCorosActivities

```typescript
async function syncCorosActivities(userId, options?): Promise<CorosSyncResult>;
```

流程：
1. 创建同步批次记录
2. 登录 COROS，分页拉取所有活动（每页 20 条，最多 100 页）
3. 去重（`external_id` 优先 `labelId`，回退为内容 SHA-256）
4. 事务内：
   - upsert 所有活动
   - 软删除远端已不存在的活动
   - 按日汇总活动热量
   - upsert 日汇总
   - 更新每日记录的 `coros_activity_calories`（保留手工录入的有效活动消耗）
   - 重算每日记录
5. 更新批次状态

### 热量转换

COROS 原始热量单位为千分之一千卡（`calorie` 字段），转换：`calories_kcal = calorie_raw / 1000`。

---

## http.ts — HTTP 工具

### 职责

提供 API Route 的错误处理、JSON 解析、同源校验、数值校验等工具。

### 导出

```typescript
class ApiError extends Error {
  constructor(status: number, message: string, code?: string);
}

function jsonError(error: unknown): NextResponse;  // 统一错误响应
async function readJson<T>(request: Request): Promise<T>;  // JSON 解析
function assertSameOrigin(request: Request): void;  // 同源校验
function positiveNumber(value: unknown, field: string, allowZero?: boolean): number;  // 数值校验
```

---

## client.ts — 浏览器 API 客户端

### 职责

浏览器端统一的 API 调用封装。

### 导出

```typescript
class ApiClientError extends Error {
  constructor(message: string, code?: string, status?: number);
}

async function api<T>(url: string, options?: RequestInit): Promise<T>;

function chinaDate(date?: Date): string;      // 上海时区日期 "YYYY-MM-DD"
function shiftDate(value: string, days: number): string;  // 日期偏移
```

### 特殊行为

- `403 PASSWORD_CHANGE_REQUIRED` → 自动跳转 `/change-password`
- `FormData` 请求不设置 `Content-Type`（让浏览器自动设置 boundary）
- 非 JSON 响应返回空对象，不抛异常

---

## food-validation.ts — 食品数据校验

### 职责

校验管理员审核后的食品营养数据。

```typescript
function parseReviewedFood(input: Partial<ReviewedFood>): ReviewedFood;
```

校验规则：
- 名称：1-200 字符
- 份量名称：默认 "100克"，最长 60 字符
- 克重：1-2000
- 热量：0-5000
- 蛋白质/碳水/脂肪/纤维：0-500
