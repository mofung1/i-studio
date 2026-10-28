#!/usr/bin/env bash
# Build the current checkout and publish the application image to Docker Hub.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME=""
IMAGE_TAG=""
PLATFORMS=""
BUILDER_NAME="istudio-image"
LOCAL_ONLY=0
NO_CACHE=0
DRY_RUN=0

usage() {
  cat <<'EOF'
iStudio 镜像更新：构建当前本地代码并推送 Docker Hub

  ./update-image.sh                   发布 mofugn1/istudio:latest（amd64 + arm64）
  ./update-image.sh --tag 2026.10.27   发布指定版本标签
  ./update-image.sh --image user/repo 发布到自己的 Docker Hub 仓库
  ./update-image.sh --platform linux/amd64
  ./update-image.sh --local           只构建本机镜像 istudio:local
  ./update-image.sh --no-cache        忽略构建缓存
  ./update-image.sh --dry-run         只预览命令
  ./update-image.sh --help            查看帮助

首次发布前启动 Docker，并执行 docker login 登录有推送权限的账号。
构建包含当前工作区的代码修改，无需先提交；发布后由服务器拉取镜像。
EOF
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

require_value() {
  [[ $# -ge 2 && -n "$2" && "$2" != -* ]] || die "$1 缺少参数值"
}

run() {
  printf '+ '
  printf '%q ' "$@"
  printf '\n'
  if [[ "$DRY_RUN" -eq 0 ]]; then
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) require_value "$@"; IMAGE_NAME="$2"; shift 2 ;;
    --tag) require_value "$@"; IMAGE_TAG="$2"; shift 2 ;;
    --platform) require_value "$@"; PLATFORMS="$2"; shift 2 ;;
    --local) LOCAL_ONLY=1; shift ;;
    --no-cache) NO_CACHE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1；使用 --help 查看帮助" ;;
  esac
done

if [[ "$LOCAL_ONLY" -eq 1 ]]; then
  IMAGE_NAME="${IMAGE_NAME:-istudio}"
  IMAGE_TAG="${IMAGE_TAG:-local}"
  [[ "$PLATFORMS" != *,* ]] || die "--local 只支持单一平台，请用 --platform 指定一个平台"
else
  IMAGE_NAME="${IMAGE_NAME:-mofugn1/istudio}"
  IMAGE_TAG="${IMAGE_TAG:-latest}"
  PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
  [[ "$IMAGE_NAME" == */* ]] || die "发布仓库应为 Docker Hub 用户名/仓库名"
fi

[[ "$IMAGE_NAME" =~ ^[a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)?$ ]] ||
  die "镜像名格式无效；使用 Docker Hub 用户名/仓库名，不含标签"
[[ "$IMAGE_TAG" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ && ${#IMAGE_TAG} -le 128 ]] ||
  die "镜像标签格式无效，最多 128 个字符"
[[ -z "$PLATFORMS" || "$PLATFORMS" =~ ^linux/(amd64|arm64)(,linux/(amd64|arm64))*$ ]] ||
  die "平台仅支持 linux/amd64、linux/arm64，多个平台用逗号分隔"
[[ -f "$PROJECT_ROOT/docker/image.Dockerfile" ]] || die "找不到 docker/image.Dockerfile"

REVISION="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || printf 'unknown')"
IMAGE_REF="$IMAGE_NAME:$IMAGE_TAG"
BUILD_COMMAND=(docker buildx build
  --file "$PROJECT_ROOT/docker/image.Dockerfile"
  --tag "$IMAGE_REF"
  --build-arg "VCS_REF=$REVISION"
  --pull)

if [[ "$DRY_RUN" -eq 0 ]]; then
  command -v docker >/dev/null 2>&1 || die "未找到 docker，请先安装 Docker Desktop 或 Docker Engine"
  docker info >/dev/null 2>&1 || die "无法连接 Docker，请先启动 Docker 并检查当前 Docker context"
  docker buildx version >/dev/null 2>&1 || die "未找到 Docker Buildx，请先安装或更新 Docker"
fi

if [[ "$LOCAL_ONLY" -eq 1 ]]; then
  BUILD_COMMAND+=(--load)
  printf '构建本机镜像：%s\n' "$IMAGE_REF"
else
  printf '构建并发布镜像：%s\n' "$IMAGE_REF"
  printf '首次发布请先执行 docker login，登录有该仓库推送权限的账号。\n'
  if [[ "$DRY_RUN" -eq 0 ]] && ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    run docker buildx create --name "$BUILDER_NAME" --driver docker-container
  fi
  run docker buildx inspect "$BUILDER_NAME" --bootstrap
  BUILD_COMMAND+=(--builder "$BUILDER_NAME" --push)
fi

if [[ -n "$PLATFORMS" ]]; then
  BUILD_COMMAND+=(--platform "$PLATFORMS")
fi
if [[ "$NO_CACHE" -eq 1 ]]; then
  BUILD_COMMAND+=(--no-cache)
fi
BUILD_COMMAND+=("$PROJECT_ROOT")
run "${BUILD_COMMAND[@]}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '预览完成。\n'
  if [[ "$LOCAL_ONLY" -eq 0 ]]; then
    printf '实际发布时会按需创建并复用构建器 %s。\n' "$BUILDER_NAME"
  fi
elif [[ "$LOCAL_ONLY" -eq 1 ]]; then
  printf '本机镜像已更新：%s\n' "$IMAGE_REF"
else
  printf '镜像已推送：%s\n' "$IMAGE_REF"
  printf '服务器 .env 中的 ISTUDIO_IMAGE 应指向该标签，随后在部署目录执行：\n'
  printf '  docker compose pull app\n'
  printf '  docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 app\n'
fi
