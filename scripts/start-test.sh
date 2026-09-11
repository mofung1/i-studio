#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
START_INFRA=true
API_PID=""
WEB_PID=""

usage() {
  cat <<'EOF'
用法：./scripts/start-test.sh [选项]

选项：
  --no-infra  不启动 PostgreSQL 和 Redis，使用已运行的基础设施
  -h, --help  显示帮助

启动地址：
  Web: http://127.0.0.1:3000
  API: http://127.0.0.1:4000
EOF
}

for argument in "$@"; do
  case "$argument" in
    --no-infra)
      START_INFRA=false
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知选项：$argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少必要命令：$1" >&2
    exit 1
  fi
}

cleanup() {
  trap - EXIT INT TERM
  echo
  echo "正在停止 iStudio 应用进程..."
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local pid="$3"
  local attempts=40

  while (( attempts > 0 )); do
    if curl --silent --fail --max-time 1 "$url" >/dev/null 2>&1; then
      echo "✓ $name 已就绪：$url"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name 启动失败，请检查上方日志。" >&2
      return 1
    fi
    attempts=$((attempts - 1))
    sleep 0.5
  done

  echo "$name 启动超时：$url" >&2
  return 1
}

require_command pnpm
require_command go
require_command curl

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "尚未安装前端依赖，请先运行：pnpm install" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/apps/web/.env.local" ]]; then
  cp "$ROOT_DIR/apps/web/.env.local.example" "$ROOT_DIR/apps/web/.env.local"
  echo "✓ 已创建 apps/web/.env.local"
fi

if [[ ! -f "$ROOT_DIR/apps/server/.env" ]]; then
  cp "$ROOT_DIR/apps/server/.env.example" "$ROOT_DIR/apps/server/.env"
  echo "✓ 已创建 apps/server/.env"
  echo "提示：如需真实生图，请在 apps/server/.env 中填写 BANANA_ROUTER_API_KEY。"
fi

if [[ "$START_INFRA" == true ]]; then
  require_command docker
  echo "正在启动 PostgreSQL 和 Redis..."
  docker compose -f "$COMPOSE_FILE" up -d
fi

trap cleanup EXIT INT TERM

echo "正在启动 Go API..."
(
  cd "$ROOT_DIR/apps/server"
  exec go run .
) &
API_PID=$!

echo "正在启动 Next.js Web..."
(
  cd "$ROOT_DIR"
  exec pnpm dev:web
) &
WEB_PID=$!

wait_for_url "API" "http://127.0.0.1:4000/v1/health" "$API_PID"
wait_for_url "Web" "http://127.0.0.1:3000" "$WEB_PID"

cat <<'EOF'

iStudio 已启动，可开始测试：
  Web: http://127.0.0.1:3000
  API: http://127.0.0.1:4000/v1/health

按 Ctrl+C 停止 Web 和 API。PostgreSQL/Redis 容器会继续运行，方便下次启动。
如需停止容器：docker compose -f infra/docker/docker-compose.yml down
EOF

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

echo "检测到应用进程退出。" >&2
exit 1
