# 数据库设计

## 概览

FitFuel 使用单个 PostgreSQL 数据库，包含三个 schema：

| Schema | 用途 | 模型数 |
|--------|------|--------|
| `fitfuel` | 业务数据（用户、认证、每日记录、餐食、导入等） | 17 |
| `food_info` | 共享食品目录（食品、分类、营养、份量） | 4 |
| `sport` | COROS 运动数据（活动、日汇总、同步批次） | 3 |

跨 schema 外键：`fitfuel.meal_item.food_id` → `food_info.food.id`，`fitfuel.ai_food_lookup.food_id` → `food_info.food.id`。

## ER 关系图

```
fitfuel schema:
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   app_user   │─────│  user_profile    │     │ nutrition_goal  │
│──────────────│     │──────────────────│     │─────────────────│
│ id (PK)      │1:1  │ user_id (PK,FK)  │     │ id (PK)         │
│ email        │     │ height_cm        │     │ user_id (FK)    │
│ display_name │     │ age / gender     │     │ goal_type       │
│ password_hash│     │ initial_weight   │     │ calories_kcal   │
│ role         │     │ target_weight    │     │ protein/carb/fat│
│ must_change_ │     └──────────────────┘     │ water_ml        │
│   password   │                              └─────────────────┘
│ created_by   │1:N  ┌──────────────────┐     ┌─────────────────┐
└──────┬───────┘─────│  auth_session    │     │  water_log      │
       │             │──────────────────│     │─────────────────│
       │1:N          │ id (PK)          │     │ id (PK)         │
       │             │ user_id (FK)     │     │ user_id (FK)    │
       │             │ token_hash       │     │ amount_ml       │
       │             │ expires_at       │     │ logged_at       │
       │             └──────────────────┘     └─────────────────┘
       │
       │1:N  ┌──────────────────┐     ┌─────────────────┐
       ├─────│  daily_record    │1:N  │     meal        │1:N  ┌──────────────┐
       │     │──────────────────│─────│─────────────────│─────│  meal_item   │
       │     │ id (PK)          │     │ id (PK)         │     │──────────────│
       │     │ user_id (FK)     │     │ daily_record_id │     │ meal_id (FK) │
       │     │ record_date      │     │ meal_type       │     │ food_id (FK) │──→ food_info.food
       │     │ weight_kg        │     │ display_name    │     │ food_name_   │
       │     │ calories_consumed│     │ source          │     │   snapshot   │
       │     │ calories_source  │     │ elevatine_      │     │ quantity     │
       │     │ macro_source     │     │   batch_id      │     │ calories_    │
       │     │ activity_calories│     └─────────────────┘     │   snapshot   │
       │     │ elevatine_*      │                             │ source       │
       │     │ coros_activity_* │                             └──────────────┘
       │     └──────────────────┘
       │
       │1:N  ┌─────────────────────┐     ┌──────────────────────┐
       ├─────│  custom_food        │     │  ai_food_lookup      │
       │     │─────────────────────│     │──────────────────────│
       │     │ id (PK)             │     │ normalized_query (PK)│
       │     │ user_id (FK)        │     │ food_id (FK)──→food  │
       │     │ name / brand        │     │ model / confidence   │
       │     │ nutrition fields    │     │ created_by (FK)      │
       │     └─────────────────────┘     └──────────────────────┘
       │
       │1:N  ┌─────────────────────────┐
       ├─────│  daily_data_import_batch│1:N ┌─────────────────────────┐
       │     │─────────────────────────│────│  daily_data_import_row  │
       │     │ id (PK)                 │    │─────────────────────────│
       │     │ user_id (FK)            │    │ batch_id (FK)           │
       │     │ file_name / format      │    │ record_date             │
       │     │ status / row_count      │    │ imported_calories       │
       │     │ committed_at / rolled_  │    │ imported_activity/weight│
       │     │   back_at / expires_at  │    │ before_snapshot         │
       │     └─────────────────────────┘    └─────────────────────────┘
       │
       │1:N  ┌─────────────────────────┐
       ├─────│  elevatine_import_batch │1:N ┌─────────────────────────┐
       │     │─────────────────────────│────│  elevatine_import_image │
       │     │ id (PK)                 │    │─────────────────────────│
       │     │ user_id (FK)            │    │ batch_id (FK)           │
       │     │ status / default_year   │    │ storage_key / sha256    │
       │     │ image_count             │    │ image_kind / parsed_json│
       │     │ committed_at / rolled_  │    │ assigned_date           │
       │     │   back_at / expires_at  │    └─────────────────────────┘
       │     └─────────────────────────┘
       │               │1:N
       │               ├──── ┌─────────────────────────┐
       │               │     │  elevatine_import_day   │1:N ┌─────────────────────────┐
       │               │     │─────────────────────────│────│  elevatine_import_item  │
       │               │     │ batch_id (FK)           │    │─────────────────────────│
       │               │     │ record_date             │    │ day_id (FK)             │
       │               │     │ calories / macro fields │    │ image_id (FK)           │
       │               │     │ before_snapshot         │    │ food_name / quantity    │
       │               │     │ after_updated_at        │    │ calories / macro fields │
       │               │     └─────────────────────────┘    │ match_status            │
       │               │                                  └─────────────────────────┘
       │               │
       │1:N  ┌─────────────────────────┐
       ├─────│  food_catalog_audit     │
       │     │─────────────────────────│
       │     │ id (PK)                 │
       │     │ food_id (FK)──→food     │
       │     │ action / query / model  │
       │     │ raw_candidate / final_  │
       │     │   values                │
       │     │ actor_user_id (FK)      │
       │     └─────────────────────────┘
       │
       │1:N  ┌─────────────────────────┐
       └─────│  activity_period_total  │
             │─────────────────────────│
             │ id (PK)                 │
             │ user_id (FK)            │
             │ period_start / end      │
             │ active_calories_total   │
             │ source / note           │
             └─────────────────────────┘

food_info schema:
┌──────────────────┐     ┌──────────────────┐
│  food_category   │1:N  │      food        │1:N ┌──────────────────┐
│──────────────────│─────│──────────────────│────│  food_nutrition  │
│ id (PK)          │     │ id (PK)          │    │──────────────────│
│ parent_id        │     │ name / category  │    │ food_id (FK)     │
│ name / sort_order│     │ brand / status   │    │ unit (100g)      │
└──────────────────┘     └──────────────────┘    │ calories         │
                                  │1:N           │ protein/carb/fat │
                                  └──────────────│ dietary_fiber    │
                                     ┌──────────────────────────┐  │
                                     │      food_serving        │  │
                                     │──────────────────────────│  │
                                     │ food_id (FK)             │  │
                                     │ serving_name             │  │
                                     │ gram_weight              │  │
                                     │ is_default               │  │
                                     └──────────────────────────┘  │
                                                   └──────────────────┘

sport schema:
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ coros_sync_batch │1:N  │ coros_activity   │     │ coros_daily_summary  │
│──────────────────│─────│──────────────────│     │──────────────────────│
│ id (PK)          │     │ id (PK)          │     │ id (PK)              │
│ user_id (FK)     │     │ user_id (FK)     │     │ user_id (FK)         │
│ start/end_date   │     │ sync_batch_id    │     │ sync_batch_id        │
│ status           │     │ external_id      │     │ summary_date         │
│ activity_count   │     │ activity_date    │     │ activity_count       │
│ day_count        │     │ sport_type / mode│     │ calories_kcal        │
│ error_message    │     │ calories_kcal    │     └──────────────────────┘
└──────────────────┘     │ raw_payload (JSON)│
                         └──────────────────┘
```

## 核心数据模型详解

### app_user（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | 自增主键 |
| email | varchar(320) | 唯一，可为空 |
| display_name | varchar(100) | 显示名称 |
| password_hash | text | argon2 哈希 |
| status | smallint | 0=停用, 1=活跃 |
| role | varchar(16) | "user" 或 "admin" |
| must_change_password | boolean | 首次登录强制改密 |
| password_changed_at | timestamptz | 改密时间 |
| created_by | bigint | 创建者（管理员创建） |

### daily_record（每日记录）

每日记录是核心业务实体，承载营养摄入与消耗计算。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | 自增主键 |
| user_id | bigint FK | 用户 |
| record_date | date | 记录日期（唯一约束 user_id + record_date） |
| weight_kg | numeric(5,2) | 当日体重 |
| calories_consumed | int | 有效摄入热量 |
| calories_source | varchar(16) | 摄入来源：manual / meals / import / elevatine |
| macro_source | varchar(16) | 宏量营养来源：meals / elevatine |
| meal_calories | int | 餐食计算热量 |
| manual_calories | int? | 手工输入热量 |
| imported_calories | int? | 导入热量 |
| elevatine_calories | int? | Elavatine 识别热量 |
| elevatine_carbohydrate/protein/fat | numeric? | Elavatine 宏量营养 |
| activity_calories | decimal(10,2) | 活动消耗 |
| activity_source | varchar(16) | 活动来源：manual / coros |
| coros_activity_calories | decimal? | COROS 同步活动消耗 |
| bmr / tef / tdee / calorie_balance | numeric | 计算字段 |
| import_batch_id | bigint? | 关联导入批次 |
| elevatine_batch_id | bigint? | 关联 Elavatine 批次 |

**摄入来源优先级**：`calories_source` 决定 `calories_consumed` 取自哪个候选值。用户可在前端切换来源。

### meal / meal_item（餐食 / 餐食明细）

餐食按类型（breakfast/lunch/dinner/snack/elevatine_*）分组，每条 meal_item 保存营养快照（不依赖食品库实时数据），确保历史记录不被食品库更新影响。

`source` 字段标识数据来源：`database`（共享库）/ `user`（私人食品）/ `ai`（AI 估算）/ `elevatine`（截图识别）。

### food / food_nutrition / food_serving（食品目录）

共享食品目录位于 `food_info` schema，所有用户可见。

- `food` — 食品基本信息（名称、品牌、分类、状态）
- `food_nutrition` — 营养数据（按份量单位存储，默认 100g）
- `food_serving` — 份量定义（如"1个(约100g)"、"1碗(约200g)"）

### elevatine_import_*（Elavatine 图片同步）

完整的多图上传→解析→审核→提交→撤销流程：

1. `elevatine_import_batch` — 批次（状态：uploaded→parsing→review→committed/rolled_back/expired）
2. `elevatine_import_image` — 图片记录（storage_key 指向私有存储，parsed_json 保存 AI 解析结果）
3. `elevatine_import_day` — 日期汇总（含 before_snapshot 用于撤销恢复）
4. `elevatine_import_item` — 食品明细（match_status: matched/ambiguous/unmatched/estimated/estimate_failed）

### coros_*（COROS 运动同步）

- `coros_sync_batch` — 同步批次
- `coros_activity` — 单次运动活动（raw_payload 保存完整 JSON）
- `coros_daily_summary` — 日汇总热量

## 迁移历史

| 版本 | 文件 | 内容 |
|------|------|------|
| 000 | 000_food_catalog.sql | 共享食品目录（food_info schema） |
| 001 | 001_init_fitfuel.sql | 初始业务表 + 周统计视图 |
| 002 | 002_auth_and_persistence.sql | 认证持久化（会话、软删除、角色） |
| 003 | 003_admin_and_shared_ai.sql | 管理员功能、AI 食品审计 |
| 004 | 004_daily_data_import_export.sql | 每日数据导入导出 |
| 005 | 005_decimal_activity_calories.sql | 活动消耗改为 decimal |
| 006 | 006_elevatine_image_sync.sql | Elavatine 图片同步 |
| 007 | 007_coros_sport_sync.sql | COROS 运动同步 |
| 008 | 008_activity_period_total.sql | 活动消耗期间总量 |
| 009 | 009_elevatine_estimate_status.sql | Elavatine 估算状态 |

所有迁移均为**幂等**设计，使用 `create table if not exists` / `on conflict do nothing`，可安全重复执行。

## 视图

### weekly_summary

自动按周聚合每日记录，计算平均摄入、平均活动消耗、平均 TDEE、平均热量差、理论体重变化、周初/周末体重。

```sql
create view fitfuel.weekly_summary as
select
  user_id,
  date_trunc('week', record_date)::date as week_start,
  count(*) as recorded_days,
  round(avg(calories_consumed)) as average_intake_kcal,
  round(avg(activity_calories)) as average_activity_kcal,
  round(avg(tdee)) as average_tdee_kcal,
  round(avg(calorie_balance)) as average_calorie_balance_kcal,
  round((sum(calorie_balance) / 7700.0)::numeric, 3) as theoretical_weight_change_kg,
  -- start_weight_kg / end_weight_kg ...
from fitfuel.daily_record
group by user_id, date_trunc('week', record_date);
```

## 约束与索引

- **CHECK 约束**：体重范围、年龄范围、性别枚举、目标类型枚举、热量非负、数量正数等
- **唯一约束**：`user_id + record_date`、`user_id + effective_to is null`（活跃目标）、`batch_id + record_date`、`batch_id + sha256`（图片去重）
- **表达式索引**：`app_user` 的 email lower 索引、`nutrition_goal` 的部分唯一索引
- **外键策略**：用户删除级联（CASCADE）；食品删除置空（SET NULL）；批次删除级联
