#!/usr/bin/env bash
# FitFuel 服务端部署脚本
# 用法: ./scripts/deploy.sh

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

echo "=== FitFuel Deploy ==="

# 检查必要文件
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

# 拉取最新镜像
echo ">>> Pulling latest image..."
docker compose -f "$COMPOSE_FILE" pull app

# 数据库迁移（如需要可取消注释）
# echo ">>> Running database migrations..."
# docker compose -f "$COMPOSE_FILE" run --rm app node scripts/init-db.mjs

# 启动/更新服务
echo ">>> Starting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans app

# 清理旧镜像
echo ">>> Pruning dangling images..."
docker image prune -f

echo "=== Deploy complete ==="
docker compose -f "$COMPOSE_FILE" ps
