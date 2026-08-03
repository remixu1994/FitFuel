# 部署指南

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 22+ | 推荐 22.22+ (裸机部署) |
| Docker | 24+ | Docker 部署方式 |
| PostgreSQL | 14+ | 需支持多 schema |
| npm | 10+ | 随 Node.js 安装 |

## Docker 部署（推荐）

### CI/CD 自动构建

项目已配置 GitHub Actions（`.github/workflows/deploy.yml`），推送 main 分支时自动：

1. **构建 Docker 镜像** — 基于 Node.js 22 Alpine，多阶段构建优化体积
2. **推送到 ghcr.io** — 标签格式：`sha-xxxxx` + `latest`
3. **自动 SSH 部署**（可选）— 需配置 GitHub Secrets

镜像地址：`ghcr.io/remixu1994/fitfuel`

### GitHub 配置

在仓库 **Settings → Secrets and variables → Actions** 中配置：

#### 自动部署所需 Secrets（可选）

| Secret | 说明 |
|--------|------|
| `DEPLOY_HOST` | 服务器 IP 或域名 |
| `DEPLOY_USER` | SSH 登录用户 |
| `DEPLOY_SSH_KEY` | SSH 私钥 |
| `DEPLOY_PORT` | SSH 端口（默认 22） |

#### 自动部署所需 Variables

| Variable | 说明 |
|----------|------|
| `DEPLOY_ENABLED` | 设为 `true` 开启自动 SSH 部署 |
| `DEPLOY_PATH` | 服务器上的项目路径（默认 `/opt/fitfuel`） |

> 如果不配置自动部署，每次 push 仅构建镜像，需手动 pull 到服务器。

### 服务器首次部署

```bash
# 1. 拉取项目
git clone git@github.com:remixu1994/FitFuel.git /opt/fitfuel
cd /opt/fitfuel

# 2. 创建 .env 并填入生产环境配置
cp .env.example .env
# 编辑 .env —— 填入数据库地址、MiMo API Key 等

# 3. 登录 ghcr.io（需 GitHub Personal Access Token，权限 read:packages）
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u remixu1994 --password-stdin

# 4. 拉取并启动
docker compose pull app
docker compose up -d app
```

### 后续更新

```bash
cd /opt/fitfuel
docker compose pull app
docker compose up -d --remove-orphans app
docker image prune -f
```

或直接运行部署脚本：

```bash
bash scripts/deploy.sh
```

### Docker 架构说明

```
Dockerfile (多阶段构建)
├── Stage 1: deps       — 安装生产依赖
├── Stage 2: builder    — prisma generate + next build (standalone 模式)
└── Stage 3: runner     — 仅 copy 必需文件，非 root 用户运行
```

- **Base image**: `node:22-alpine`
- **Next.js 模式**: `output: "standalone"`（自包含 server.js）
- **运行用户**: `nextjs` (uid 1001)，非 root
- **暴露端口**: `3000`

### 私有上传目录（Elavatine 图片）

Elavatine 上传图片的根目录由 `PRIVATE_UPLOAD_DIR` 控制。Docker 部署中，
**docker-compose.yml 将宿主机目录直接挂载到容器**，并让应用指向该挂载点：

```yaml
environment:
  - PRIVATE_UPLOAD_DIR=/app/uploads
volumes:
  - ./uploads:/app/uploads   # 宿主机指定目录 → 容器上传目录
```

- **默认宿主机路径**：compose 文件旁的 `./uploads`（即 `/opt/fitfuel/uploads`）。
  想用别的目录，改 compose 里的挂载路径即可（例如 `/data/fitfuel/uploads:/app/uploads`）。
- **权限要求**：容器内以非 root 用户 `nextjs`（uid 1001）运行，
  **宿主机挂载目录必须对该 uid 可写**。`scripts/deploy.sh` 会自动 `mkdir -p` 并
  `chown 1001:1001`；手动部署时执行一次：

```bash
mkdir -p /opt/fitfuel/uploads
sudo chown -R 1001:1001 /opt/fitfuel/uploads
```

- 镜像已预创建 `/app/uploads` 和 `/app/.private` 并授权给 `nextjs`，
  因此即便使用命名卷（而非宿主目录挂载）也能获得正确属主。
- 裸机部署（非 Docker）时保持默认 `PRIVATE_UPLOAD_DIR=.private/elevatine-imports` 即可。

> **升级自旧版本**：旧 compose 使用命名卷 `fitfuel_private`。升级后该卷不再使用，
> 如需清理：`docker volume rm fitfuel_private`（如有历史图片请先迁移到新挂载目录）。

## 环境变量

### 必需

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:port/fitfuel?sslmode=disable` |

或使用分散配置（二选一）：

| 变量 | 说明 |
|------|------|
| `PGHOST` | 数据库主机 |
| `PGPORT` | 数据库端口 |
| `PGUSER` | 数据库用户 |
| `PGPASSWORD` | 数据库密码 |
| `PGDATABASE` | 数据库名（默认 fitfuel） |
| `PGSSL` | 是否启用 SSL（"true"/"false"） |

### AI 服务（必需）

| 变量 | 说明 |
|------|------|
| `MIMO_BASE_URL` | MiMo API 基础 URL |
| `MIMO_API_KEY` | MiMo API 密钥 |
| `MIMO_MODEL` | 文本模型名称（如 mimo-v2.5） |
| `MIMO_VISION_MODEL` | 视觉模型名称（可选，回退到 MIMO_MODEL） |
| `AI_CANDIDATE_SECRET` | AI 候选 HMAC 签名密钥（≥32 字符） |

### COROS 运动同步（可选）

| 变量 | 说明 |
|------|------|
| `COROS_ACCOUNT` | COROS 账号 |
| `COROS_PASSWORD` | COROS 密码 |
| `COROS_API_BASE_URL` | COROS API 地址（默认 https://teamcnapi.coros.com） |
| `COROS_TEAM_API_BASE_URL` | COROS Team API 地址 |

### 其他（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PRIVATE_UPLOAD_DIR` | 图片上传根目录 | `.private/elevatine-imports` |
| `COOKIE_SECURE` | Cookie 安全标志 | 生产环境 true，开发环境 false |

## 数据库初始化

### 全新部署

```bash
# 1. 创建数据库
npm run db:init

# 2. 验证结构
npm run db:verify

# 3. 检查连接
npm run db:inspect
```

### 从旧库迁移

```bash
# 从 food_db 迁移到独立 fitfuel 数据库
npm run db:migrate:fitfuel

# 验证目标库
npm run db:verify:fitfuel
```

### Prisma 客户端

```bash
npm run prisma:generate    # 生成 Prisma Client
npm run prisma:pull        # 从数据库反向生成 schema（慎用）
```

> **注意**：`postinstall` 和 `prebuild` 脚本会自动执行 `prisma generate`，无需手动运行。

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（http://localhost:3000）
npm run dev
```

开发服务器支持热重载。Prisma Client 在开发环境下使用全局单例，防止热重载导致连接泄漏。

## 生产构建

```bash
# 构建前确保停止占用 3000 端口的服务（避免 Prisma 引擎文件锁）
# 然后构建
npm run build

# 启动生产服务器
npm run start
```

构建流程：
1. `prebuild` → `prisma generate`
2. `next build` → TypeScript 类型检查 + 编译
3. 输出至 `.next/` 目录

### 常见构建问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Prisma 引擎文件锁 | 3000 端口有运行中的 Next 服务 | 先停止服务再构建 |
| `rowCount` 可空错误 | Prisma Raw 返回类型与 pg 不同 | 显式归零处理 |
| JSON 参数绑定错误 | Prisma 将 JSON 字符串绑定为 text | SQL 中显式 `::jsonb` 转换 |
| advisory lock 返回 void | Prisma 无法反序列化 void | 显式转换为 `::text` |
| 日期参数不隐式转换 | Prisma 不自动将字符串转 date | SQL 中显式 `::date` |

## 测试

### 端到端冒烟测试

```bash
# 运行完整冒烟测试
npm run test:smoke

# 清理测试数据
npm run test:smoke:cleanup
```

冒烟测试覆盖：
- 认证与权限（登录、改密、管理员、用户隔离）
- 食品搜索（空搜索、关键词搜索、精确匹配）
- 每日记录读写
- 餐食事务
- AI 共享入库（真实 MiMo 调用）
- Excel/CSV 导入导出
- Elavatine 图片同步
- 撤销恢复

### Elavatine 视觉测试

```bash
node --env-file=.env.local scripts/elevatine-vision-smoke.mjs
```

### COROS 同步测试

```bash
npm run coros:login:test    # 测试登录
npm run coros:sync          # 执行同步
npm run coros:sync:verify   # 验证同步结果
```

## 脚本工具

| 命令 | 说明 |
|------|------|
| `npm run db:init` | 创建数据库并执行迁移 |
| `npm run db:inspect` | 检查数据库连接和表状态 |
| `npm run db:verify` | 验证数据库结构完整性 |
| `npm run db:migrate:fitfuel` | 从旧库迁移到独立 fitfuel 数据库 |
| `npm run db:verify:fitfuel` | 验证目标迁移库 |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:pull` | 反向生成 Prisma Schema |
| `npm run data:enrich:elevatine` | 批量补全 Elavatine 食品营养 |
| `npm run coros:login:test` | 测试 COROS 登录 |
| `npm run coros:sync` | 执行 COROS 活动同步 |
| `npm run coros:sync:verify` | 验证 COROS 同步结果 |
| `npm run test:smoke` | 端到端冒烟测试 |
| `npm run test:smoke:cleanup` | 清理冒烟测试数据 |

## 项目脚本文件

```
scripts/
├── inspect-db.mjs              # 数据库检查
├── init-db.mjs                 # 数据库初始化
├── migrate-to-fitfuel.mjs      # 旧库迁移
├── verify-db.mjs               # 数据库验证
├── verify-target-db.mjs        # 目标库验证
├── prisma-client.mjs           # Prisma Client 工具
├── smoke-test.mjs              # 冒烟测试
├── cleanup-smoke-data.mjs      # 测试数据清理
├── verify-latest-import.mjs    # 导入验证
├── elevatine-vision-smoke.mjs  # Elavatine 视觉测试
├── import-elevatine-folder.ts  # 批量导入 Elavatine 截图
├── verify-elevatine-import.ts  # Elavatine 导入验证
├── enrich-elevatine-foods.ts   # Elavatine 食品营养补全
├── test-coros-login.ts         # COROS 登录测试
├── sync-coros-activities.ts    # COROS 活动同步
└── verify-coros-sync.ts        # COROS 同步验证
```

## 安全注意事项

1. **`.env.local` 必须被 Git 忽略** — 数据库密码和 AI 密钥不得提交
2. **`AI_CANDIDATE_SECRET` 至少 32 字符** — 用于 HMAC 签名，防止 AI 候选篡改
3. **管理员账号管理** — 公开注册已关闭，仅管理员可创建用户
4. **图片存储为私有目录** — `PRIVATE_UPLOAD_DIR` 不在公共访问路径下
5. **COROS 凭据安全** — 使用 bcrypt(md5(password)) 格式提交，不存储明文
6. **会话 token 仅存哈希** — 即使数据库泄露也无法直接使用 token

## 运维

### 图片清理

Elavatine 图片在批次提交后自动删除。未提交的批次图片在 24 小时后过期，可通过 `cleanupExpiredElevatineImages()` 清理。

### 数据库维护

```bash
# 定期执行（建议每周）
npm run db:verify    # 验证结构完整性
npm run db:inspect   # 检查表状态
```

### 日志

- MiMo AI 请求失败：`console.error("Mimo request failed", error)`
- Elavatine 营养估算失败：`console.error("Elavatine nutrition estimate failed", ...)`
- 未处理错误：`console.error(error)` in `jsonError()`
