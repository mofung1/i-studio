#!/usr/bin/env bash
#
# iStudio 本地开发一键启动：Go API + Next 前端
#
#   ./dev.sh                 # 前端 3000 + API 4000（默认）
#   ./dev.sh --infra         # 顺带用 Docker 起 postgres/redis
#   ./dev.sh --web-port 3100 --api-port 4100
#   ./dev.sh --no-install    # 跳过 pnpm install
#
# Ctrl+C 会同时停掉前后端，并清理临时构建产物。
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT/apps/server"
WEB_DIR="$ROOT/apps/web"
DOCKER_DIR="$ROOT/docker"

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
SKIP_INSTALL=0
START_INFRA=0
BUILD_DIR=""
API_PID=""
WEB_PID=""

log()  { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[36m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }

usage() {
  cat <<'EOF'
iStudio 本地开发一键启动：Go API + Next 前端

  ./dev.sh                          前端 3000 + API 4000（默认）
  ./dev.sh --infra                  顺带用 Docker 起 postgres / redis
  ./dev.sh --web-port 3100 --api-port 4100
  ./dev.sh --no-install             跳过 pnpm install
  ./dev.sh --help                   查看帮助

  环境变量 API_PORT / WEB_PORT 也可以覆盖默认端口；
  Ctrl+C 会同时停掉前后端并释放端口。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --api-port) API_PORT="${2:?缺少端口}"; shift 2 ;;
    --web-port) WEB_PORT="${2:?缺少端口}"; shift 2 ;;
    --no-install) SKIP_INSTALL=1; shift ;;
    --infra) START_INFRA=1; shift ;;
    *) err "未知参数：$1"; usage; exit 1 ;;
  esac
done

# ---------------------------------------------------------------- 依赖检查
for cmd in go node pnpm lsof curl; do
  command -v "$cmd" >/dev/null 2>&1 || { err "缺少命令：${cmd}，请先安装后重试"; exit 1; }
done

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
port_owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" (pid "$2")"}'; }
tcp_open() { (exec 3<>"/dev/tcp/$1/$2") >/dev/null 2>&1 && exec 3<&- ; }

for port in "$API_PORT" "$WEB_PORT"; do
  if port_in_use "$port"; then
    err "端口 $port 已被占用：$(port_owner "$port")"
    err "换端口：./dev.sh --api-port 4100 --web-port 3100，或先停掉占用进程"
    exit 1
  fi
done

if [[ "$API_PORT" == "$WEB_PORT" ]]; then
  err "API 与前端端口不能相同（都是 ${API_PORT}）"
  exit 1
fi

# ---------------------------------------------------------------- 配置文件
if [[ ! -f "$SERVER_DIR/.env" ]]; then
  warn "缺少 apps/server/.env（可 copy .env.example 后填写），后端将使用内置默认值"
else
  info "AI 服务可在 Web 设置中配置；旧 AI 环境变量只用于首次迁移"
fi

if [[ ! -f "$WEB_DIR/.env.local" ]]; then
  warn "缺少 apps/web/.env.local → 前端将默认请求 http://127.0.0.1:4000"
  warn "建议写入：NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:${API_PORT}"
else
  WEB_API_URL="$(grep -E '^NEXT_PUBLIC_API_BASE_URL=' "$WEB_DIR/.env.local" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  if [[ -n "$WEB_API_URL" && "$WEB_API_URL" != *":${API_PORT}"* ]]; then
    warn "apps/web/.env.local 的 NEXT_PUBLIC_API_BASE_URL=${WEB_API_URL} 与本次 API 端口(${API_PORT})不一致，浏览器会请求错地址"
    info "  改这一行为：NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:${API_PORT}（或改用默认端口 4000）"
  fi
fi

# ------------------------------------------------------------ 数据库/Redis
DB_PORT="$(grep -E '^DATABASE_URL=' "$SERVER_DIR/.env" 2>/dev/null | sed -n 's/.*@[^:]*:\([0-9]\{2,\}\)\/.*/\1/p' | head -1)"
DB_PORT="${DB_PORT:-55432}"
REDIS_PORT="$(grep -E '^REDIS_URL=' "$SERVER_DIR/.env" 2>/dev/null | sed -n 's|.*://[^:]*:\([0-9]\{2,\}\).*|\1|p' | head -1)"
REDIS_PORT="${REDIS_PORT:-6379}"

if ! tcp_open 127.0.0.1 "$DB_PORT"; then
  warn "连不上 Postgres(127.0.0.1:$DB_PORT)：后端会降级为内存存储（重启后数据丢失）"
  if [[ "$START_INFRA" -eq 1 ]]; then
    if command -v docker >/dev/null 2>&1; then
      info "→ 启动 Docker 里的 postgres / redis …"
      (cd "$DOCKER_DIR" && docker compose up -d postgres redis)
      for _ in $(seq 1 30); do tcp_open 127.0.0.1 "$DB_PORT" && break; sleep 1; done
      tcp_open 127.0.0.1 "$DB_PORT" && info "→ Postgres 已就绪" || warn "→ Postgres 仍未就绪，请看 docker compose logs postgres"
    else
      err "未找到 docker，无法使用 --infra"
    fi
  else
    info "  想要持久化数据：cd docker && docker compose up -d postgres redis（或本脚本加 --infra）"
  fi
fi

if ! tcp_open 127.0.0.1 "$REDIS_PORT"; then
  warn "连不上 Redis(127.0.0.1:$REDIS_PORT)：任务队列退回进程内（功能可用，多进程不共享）"
  if [[ "$REDIS_PORT" == "6379" ]]; then
    info "  Docker 里的 Redis 映射在 56379；想复用它就把 apps/server/.env 的 REDIS_URL 改成 redis://127.0.0.1:56379"
  fi
fi

if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^i-studio-api-1$'; then
  warn "检测到 Docker 里的 i-studio-api 容器正在运行：两个进程会共用同一套队列，建议先 docker compose stop api"
fi

# ---------------------------------------------------------------- 前端依赖
if [[ "$SKIP_INSTALL" -eq 0 && ! -d "$WEB_DIR/node_modules" ]]; then
  info "→ 安装前端依赖（pnpm install）…"
  (cd "$WEB_DIR" && pnpm install)
fi

# ------------------------------------------------------------ 构建后端二进制
# 不用 go run：它会产生子进程，Ctrl+C 时容易留下孤儿进程
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/istudio-dev.XXXXXX")"
info "→ 编译后端（go build）…"
(cd "$SERVER_DIR" && go build -o "$BUILD_DIR/istudio-api" .)

cleanup() {
  trap - INT TERM EXIT
  printf '\n'
  log "正在停止…"
  for pid in "$WEB_PID" "$API_PID"; do
    [[ -n "$pid" ]] || continue
    pkill -P "$pid" >/dev/null 2>&1 || true
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" 2>/dev/null || true   # 回收子进程，避免打印 "Terminated" 噪音
  done
  # 端口兜底：确保 3000/4000 这类端口真的被释放
  for port in "$WEB_PORT" "$API_PORT"; do
    local pids
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    [[ -n "$pids" ]] && kill $pids >/dev/null 2>&1 || true
  done
  [[ -n "$BUILD_DIR" && -d "$BUILD_DIR" ]] && rm -rf "$BUILD_DIR"
  log "已停止，端口已释放。"
}
trap cleanup INT TERM EXIT

# ------------------------------------------------------------------- 启动
# 导出端口与来源白名单：.env 里已存在的键不会被覆盖，但命令行导出的优先于 .env
# （loadDotEnv 只填充未设置的环境变量，所以这里 export 能盖过 API_PORT=4000）
export API_PORT
export WEB_ORIGINS="http://127.0.0.1:$WEB_PORT,http://localhost:$WEB_PORT,http://127.0.0.1:3000,http://localhost:3000"

info "→ 启动后端：127.0.0.1:$API_PORT"
(cd "$SERVER_DIR" && exec "$BUILD_DIR/istudio-api") > >(sed 's/^/[api] /') 2>&1 &
API_PID=$!

info "→ 启动前端：http://127.0.0.1:$WEB_PORT"
(cd "$WEB_DIR" && exec pnpm exec next dev --hostname 127.0.0.1 --port "$WEB_PORT") > >(sed 's/^/[web] /') 2>&1 &
WEB_PID=$!

wait_http() {
  local url="$1" seconds="$2"
  for _ in $(seq 1 "$seconds"); do
    # -fs：静默失败，等就绪期间不要往日志里刷 curl 报错
    curl -fs -o /dev/null "$url" && return 0
    sleep 1
  done
  return 1
}

echo
if wait_http "http://127.0.0.1:$API_PORT/v1/health" 60; then
  log "✓ 后端就绪  http://127.0.0.1:$API_PORT/v1/health"
else
  warn "后端 60s 内未就绪，请看 [api] 日志"
fi
if wait_http "http://127.0.0.1:$WEB_PORT/" 90; then
  log "✓ 前端就绪  http://127.0.0.1:$WEB_PORT"
else
  warn "前端 90s 内未就绪，请看 [web] 日志"
fi

echo
log "  前端  http://127.0.0.1:$WEB_PORT"
log "  API   http://127.0.0.1:$API_PORT"
log "  日志  [api] / [web] 前缀实时输出，Ctrl+C 停止"
echo

wait
