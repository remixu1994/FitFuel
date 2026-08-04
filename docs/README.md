# FitFuel Technical Documentation

> AI 驱动的个人营养记录与饮食管理 Web 应用

## 项目简介

FitFuel 是一个基于 AI 的个人营养记录与饮食管理系统，帮助健身、减脂、增肌人群快速记录每日饮食、自动计算营养摄入，并基于真实数据反馈建立个人 TDEE（每日总消耗）模型。

核心差异点：**AI + 健身场景 + 个性化营养规划**——不是 MyFitnessPal 的复制品，而是一个基于真实数据反馈的个人减脂数据闭环系统。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js (App Router) | 15.x |
| UI 库 | React | 19.x |
| 语言 | TypeScript | 5.7+ |
| ORM | Prisma | 6.19+ |
| 数据库 | PostgreSQL | 多 schema |
| 密码哈希 | argon2 / bcryptjs | - |
| 图片处理 | Sharp | 0.35+ |
| Excel/CSV | ExcelJS | 4.4+ |
| 图标 | Lucide React | 0.468+ |
| AI 模型 | MiMo (文本 + 视觉) | 外部服务 |
| 运动数据 | COROS Training Hub | 外部 API |

## 文档索引

| 文档 | 内容 |
|------|------|
| [架构设计](./architecture.md) | 系统架构、目录结构、请求流转、认证流程 |
| [数据库设计](./database.md) | 三 schema 设计、数据模型、ER 关系、迁移历史 |
| [API 参考](./api-reference.md) | 全部 API 路由、请求/响应格式、权限要求 |
| [核心模块](./modules.md) | server/shared/web 各层职责、AI 集成、营养计算、导入导出 |
| [部署指南](./deployment.md) | 环境变量、本地开发、构建部署、脚本工具 |

## 快速开始

### 前置条件

- Node.js 22+
- PostgreSQL 数据库（已初始化 fitfuel / food_info / sport 三个 schema）
- MiMo AI API 凭据

### 安装

```bash
npm install                    # 安装依赖（自动执行 prisma generate）
```

### 配置环境变量

在项目根目录创建 `.env.local`：

```env
# 数据库（二选一）
DATABASE_URL=postgresql://user:pass@host:port/fitfuel?sslmode=disable
# 或分散配置
PGHOST=192.168.31.13
PGPORT=5433
PGUSER=xymhao
PGPASSWORD=your_password
PGDATABASE=fitfuel
PGSSL=false

# AI 服务
MIMO_BASE_URL=https://api.mimo.example.com
MIMO_API_KEY=your_api_key
MIMO_MODEL=mimo-v2.5
MIMO_VISION_MODEL=mimo-vision-v1   # 可选，视觉模型

# AI 候选签名密钥（≥32 字符）
AI_CANDIDATE_SECRET=your_secret_at_least_32_chars_long

# COROS 运动同步（可选）
COROS_ACCOUNT=your_coros_account
COROS_PASSWORD=your_coros_password

# 图片上传目录（可选，默认 .private/elevatine-imports）
PRIVATE_UPLOAD_DIR=.private/elevatine-imports

# Cookie 安全（可选，生产环境自动启用）
COOKIE_SECURE=true
```

### 数据库初始化

```bash
npm run db:init               # 创建数据库并执行迁移
npm run db:verify             # 验证数据库结构
npm run db:inspect            # 检查连接和表状态
```

数据库 schema、迁移和检查脚本统一位于 `infra/database/`；本地运行日志、导入文件和临时上传统一位于被忽略的 `.runtime/`。

### 开发与构建

```bash
npm run dev                   # 启动开发服务器（默认 3000 端口）
npm run build                 # 生产构建
npm run start                 # 启动生产服务器
npm run lint                  # 代码检查
npm run test:smoke            # 端到端冒烟测试
```

## 核心功能概览

1. **今日饮食** — 按餐次记录食物，实时展示营养目标进度环和营养条
2. **食物库** — 共享食品库（food_info schema）+ 用户私人食品，支持模糊搜索
3. **AI 食物识别** — 文本搜索兜底 MiMo AI 估算；图片识别（Elavatine 截图、私人食品拍照）
4. **饮食记录** — 历史每日饮食列表，支持 7/30/90 天范围与关键词搜索
5. **营养分析** — TDEE 模型（BMR + TEF + 活动消耗）、自适应 TDEE 校准、目标预测
6. **数据导入导出** — Excel/CSV 批量导入每日数据，预览/冲突解决/撤销；统计导出
7. **Elavatine 图片同步** — 多图上传、MiMo 视觉解析、多日审核、餐食快照、安全撤销
8. **COROS 运动同步** — 自动拉取运动活动、日汇总、活动消耗回写每日记录
9. **管理员后台** — 用户管理、AI 食品审核入库、共享食品审计
10. **饮水记录** — 每日饮水量记录与目标追踪
