# API 参考

所有 API 位于 `app/api/` 下，使用 Next.js App Router 的 Route Handler。除特别标注外，所有 API 均要求登录（`requireUser()`）。

## 通用约定

### 请求

- `Content-Type: application/json`（文件上传除外）
- 写操作（POST/PUT/PATCH/DELETE）校验同源（`Origin` 头）
- 日期参数统一使用 `YYYY-MM-DD` 格式
- 所有日期按 `Asia/Shanghai` 时区处理

### 响应

成功：HTTP 200 + JSON body

错误：对应 HTTP 状态码 + JSON body

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE"  // 可选
}
```

| 状态码 | 含义 |
|--------|------|
| 400 | 请求参数无效 |
| 401 | 未登录 |
| 403 | 权限不足 / 需改密 |
| 404 | 资源不存在 |
| 409 | 状态冲突 |
| 422 | 语义错误（无法处理） |
| 500 | 服务器内部错误 |
| 502 | AI 返回数据无效 |
| 503 | AI / 外部服务不可用 |
| 504 | AI 请求超时 |

### 错误代码

| code | 含义 |
|------|------|
| `PASSWORD_CHANGE_REQUIRED` | 需先修改临时密码 |
| `ADMIN_REQUIRED` | 需要管理员权限 |

---

## 认证 API

### POST `/api/auth/login`

登录并创建会话。

```json
// Request
{ "email": "user@example.com", "password": "123456" }

// Response
{ "user": { "id": 7, "email": "...", "displayName": "Remi", "role": "admin", "mustChangePassword": false } }
```

### POST `/api/auth/logout`

销毁当前会话并清除 Cookie。

### GET `/api/auth/session`

获取当前登录用户信息。

```json
{ "user": { "id": 7, "email": "...", "displayName": "Remi", "role": "admin", "mustChangePassword": false } }
```

### POST `/api/auth/register`

> 仅管理员可用。公开注册已关闭。

创建新用户（不创建会话）。

```json
// Request
{ "email": "new@example.com", "displayName": "新用户", "password": "temp_password" }
```

### POST `/api/auth/change-password`

修改密码。允许在 `mustChangePassword` 状态下调用。

```json
// Request
{ "currentPassword": "old", "newPassword": "new" }
```

---

## 每日记录 API

### GET `/api/daily-records/:date`

获取指定日期的完整饮食数据（记录、目标、资料、餐食、饮水）。

```json
{
  "record": { "id": 1, "record_date": "2026-07-28", "calories_consumed": 1650, "calories_source": "meals", "bmr": 1713.75, "tef": 132, "tdee": 2745.75, "calorie_balance": 1095.75, ... },
  "goal": { "calories_kcal": 1800, "protein_g": 110, "carbohydrate_g": 200, "fat_g": 60, "water_ml": 2000 },
  "profile": { "initial_weight_kg": 79.9, "target_weight_kg": 73, "height_cm": 175, "age": 32, "gender": "male" },
  "meals": [
    { "id": 1, "type": "breakfast", "name": "早餐", "sortOrder": 1, "source": "manual", "items": [
      { "id": 1, "name": "鸡胸肉", "quantity": 1, "unit": "100g", "calories": 165, "protein": 31, "carbohydrate": 0, "fat": 3.6, "dietaryFiber": 0, "source": "database" }
    ]}
  ],
  "water": 500
}
```

### PUT `/api/daily-records/:date`

手动更新每日记录（体重、摄入、活动消耗、备注）。会触发营养计算重算。

```json
// Request
{ "weight": 77.5, "caloriesConsumed": 2200, "activityCalories": 900, "note": "训练日" }
```

### DELETE `/api/daily-records/:date`

软删除指定日期的记录。

### PUT `/api/daily-records/:date/calories-source`

切换摄入热量来源。

```json
// Request
{ "source": "meals" }  // manual / meals / import / elevatine
```

### PUT `/api/daily-records/:date/activity`

更新活动消耗。

```json
// Request
{ "activityCalories": 850 }
```

---

## 餐食 API

### POST `/api/meals/items`

向指定餐次添加食物。

```json
// Request
{
  "date": "2026-07-28",
  "mealType": "breakfast",       // breakfast / lunch / dinner / snack
  "foodKey": "shared:42",        // 共享库 key
  "quantity": 1
}
```

### PATCH `/api/meals/items/:id`

编辑餐食明细（名称、数量、营养快照）。

```json
// Request
{ "name": "鸡胸肉", "quantity": 1.5, "unit": "100g", "calories": 247.5, "protein": 46.5, "carbohydrate": 0, "fat": 5.4, "dietaryFiber": 0 }
```

### DELETE `/api/meals/items/:id`

软删除餐食明细（移入回收站）。

### POST `/api/meals/items/:id/ai-estimate`

使用 MiMo AI 按食品名称和实际份量估算营养。

```json
// Response
{ "estimate": { "calories": 247.5, "protein": 46.5, "carbohydrate": 0, "fat": 5.4, "dietaryFiber": 0, "confidence": 0.85, "reason": "基于100克鸡胸肉的常见营养数据" } }
```

---

## 食品搜索 API

### GET `/api/foods?q=关键词`

搜索共享食品库和当前用户的私人食品。

```json
{
  "foods": [
    { "key": "shared:42", "name": "鸡胸肉", "brand": null, "serving": "100g", "gram_weight": 100, "calories": 165, "protein": 31, "carbohydrate": 0, "fat": 3.6, "dietary_fiber": 0, "source": "shared" },
    { "key": "custom:7", "name": "自制蛋白棒", "serving": "1根", "gram_weight": 80, "calories": 280, "source": "custom" }
  ],
  "canUseAi": false   // 仅管理员为 true
}
```

- 空关键词返回空数组（不查询整库）
- 搜索范围：`food_info.food` (共享) + `fitfuel.custom_food` (私人)
- 限制：每类最多 40 条，总计最多 50 条

---

## 管理员 API

> 以下 API 均要求 `requireAdmin()`。

### GET `/api/admin/users`

获取用户列表。

### POST `/api/admin/users`

创建新用户（临时密码，强制改密）。

### PATCH `/api/admin/users/:id`

更新用户状态（启用/停用）。

### POST `/api/admin/users/:id/reset-password`

重置用户密码（临时密码，强制改密）。

### POST `/api/admin/foods/ai-search`

使用 MiMo AI 搜索食品，返回 HMAC 签名的候选数据。

```json
// Request
{ "query": "黄焖鸡米饭" }

// Response
{ "candidate": { "name": "黄焖鸡米饭", "serving": "1份(约400g)", "calories": 680, ... }, "candidateToken": "<HMAC签名>", "existingFood": null }
```

### POST `/api/admin/foods/ai-import`

审核确认后，将 AI 候选写入共享食品库，并加入指定餐次。

```json
// Request
{
  "candidateToken": "<HMAC签名>",
  "date": "2026-07-28",
  "mealType": "lunch",
  "quantity": 1,
  "food": { "name": "黄焖鸡米饭", "serving": "1份(约400g)", "gramWeight": 400, "calories": 680, "protein": 35, "carbohydrate": 90, "fat": 18, "dietaryFiber": 2 }
}
```

---

## 私人食品 API

### GET/POST/PATCH `/api/custom-foods`

用户私人食品的 CRUD。

### POST `/api/custom-foods/image-preview`

上传图片，使用 MiMo 视觉模型识别食品营养（不持久化图片，不写入数据库）。

```json
// Request: FormData (file)
// Response
{ "food": { "name": "南瓜馒头", "quantity": 100, "unit": "g", "calories": 220, "carbohydrate": 43.6, "protein": 9.1, "fat": 1.5 } }
```

---

## 饮食记录 API

### GET `/api/records?days=7`

获取最近 N 天的每日饮食聚合（含空日期）。支持 `days=7/30/90`。

```json
{
  "days": [
    { "date": "2026-07-28", "meals": [...], "totals": { "calories": 1650, "protein": 95, "carbohydrate": 180, "fat": 52, "dietaryFiber": 8 }, "source": "meals" },
    { "date": "2026-07-27", "meals": [], "totals": null, "source": null }
  ]
}
```

---

## 统计 API

### GET `/api/stats?range=30d`

获取统计分析数据。支持 `range=7d/30d/90d`。

```json
{
  "range": "30d",
  "records": [...],
  "weekly": [...],
  "profile": { "initial_weight_kg": 79.9, "target_weight_kg": 73, ... },
  "summary": {
    "averageIntake": 2090,
    "averageActivity": 849,
    "averageTdee": 2733,
    "averageBalance": 642,
    "actualTdee": 2700,          // 自适应 TDEE（基于真实体重变化反推）
    "currentWeight": 77.6,
    "startWeight": 79.9,
    "targetWeight": 73,
    "weeklyRate": 0.58,          // 每周理论减脂 kg
    "estimatedDate": "2026-09-20", // 预计达标日期
    "periodStart": "2026-06-29",
    "periodEnd": "2026-07-28",
    "periodDays": 30,
    "recordedDays": 25,
    "periodActivityTotal": 25470,
    "dailyActivityTotal": 21225,
    "periodActivitySource": "daily",  // daily / period_manual
    "periodTdee": 75930,
    "periodBalance": 13230
  }
}
```

---

## 数据导入导出 API

### POST `/api/data-imports/preview`

上传 Excel/CSV 文件，解析并返回预览数据。

```json
// Request: FormData (file)
// Response
{ "batchId": 1, "format": "xlsx", "rows": [{ "date": "2026-07-20", "calories": 1842, "activityCalories": 561, "weight": 77.5 }] }
```

### POST `/api/data-imports/:id/commit`

提交导入批次（写入每日记录）。

### POST `/api/data-imports/:id/rollback`

撤销导入批次（恢复 before_snapshot）。

### GET `/api/data-imports/template?format=xlsx`

下载导入模板。

### GET `/api/data-exports?range=30d&format=csv`

导出统计数据。

---

## Elavatine 图片同步 API

### POST `/api/elevatine-imports`

创建批次并上传图片。

```json
// Request: FormData (files[], defaultYear)
// Response
{ "batchId": 1, "imageCount": 5 }
```

### POST `/api/elevatine-imports/:id/parse`

触发 MiMo 视觉解析。

### GET `/api/elevatine-imports/:id`

获取审核数据（批次、图片、日期、食品明细）。

### PATCH `/api/elevatine-imports/:id`

修改审核数据（日期选择、食品分配、营养编辑）。

### POST `/api/elevatine-imports/:id/commit`

提交批次（写入餐食和每日记录，删除原始图片）。

### POST `/api/elevatine-imports/:id/rollback`

撤销批次（恢复 before_snapshot，仅允许撤销最近一次）。

---

## COROS 运动同步 API

### GET `/api/coros/connection/test`

测试 COROS 账号连接。

### POST `/api/coros/sync`

触发 COROS 活动同步。

```json
// Request
{ "startDate": "2026-01-01", "endDate": "2026-12-31" }

// Response
{ "batchId": 1, "activityCount": 45, "dayCount": 30, "days": [{ "date": "2026-07-28", "activityCount": 1, "caloriesKcal": 450.5 }] }
```

### GET `/api/coros/activities/history`

获取同步历史。

### GET `/api/coros/activities`

获取活动列表。

---

## 其他 API

### GET/PUT `/api/profile`

获取/更新个人资料（身高、年龄、性别、体重目标）。

### GET/PUT `/api/goals/current`

获取/更新当前营养目标。

### POST `/api/water`

记录饮水量。

```json
// Request
{ "date": "2026-07-28", "amount": 250 }
```

### GET `/api/trash`

获取回收站（软删除的餐食明细）。

### GET/POST `/api/activity-periods`

活动消耗期间总量管理（用于覆盖每日活动消耗的汇总值）。
