#!/usr/bin/env bash
# FitFuel 服务端部署脚本
# 用法: ./tools/scripts/deploy.sh

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

echo "=== FitFuel Deploy ==="

# 检查必要文件
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

# 准备上传目录（与 docker-compose.yml 的挂载路径保持一致）
# 容器内以 uid 1001 (nextjs) 运行，宿主机目录必须对该 uid 可写
UPLOAD_DIR="${UPLOAD_DIR:-./uploads}"
mkdir -p "$UPLOAD_DIR"
mkdir -p "./.runtime/logs" "./.runtime/imports" "./.runtime/uploads"
if ! chown -R 1001:1001 "$UPLOAD_DIR" 2>/dev/null; then
  echo "WARN: 无法自动设置 $UPLOAD_DIR 属主（可能需要 root/sudo）。"
  echo "      请手动执行: sudo chown -R 1001:1001 $UPLOAD_DIR"
fi
echo ">>> Upload directory ready: $UPLOAD_DIR"

# 拉取最新镜像
echo ">>> Pulling latest image..."
docker compose -f "$COMPOSE_FILE" pull app

# 数据库迁移（如需要可取消注释）
# echo ">>> Running database migrations..."
# docker compose -f "$COMPOSE_FILE" run --rm app node infra/database/scripts/init-db.mjs

# 启动/更新服务
echo ">>> Starting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans app

# 清理旧镜像
echo ">>> Pruning dangling images..."
docker image prune -f

echo "=== Deploy complete ==="
docker compose -f "$COMPOSE_FILE" ps
