#!/usr/bin/env bash
#
# 构建并发布 yxrhub.com 容器镜像到 GitHub Container Registry。
#
# 用法:
#   bash scripts/release.sh                    # 自动生成时间戳标签,构建 + 打 latest + 推送
#   bash scripts/release.sh 20260930093000     # 使用指定标签
#   bash scripts/release.sh --no-push          # 只构建和打标签,不推送
#   bash scripts/release.sh --dry-run          # 只打印将要执行的命令
#   bash scripts/release.sh --help
#
# 环境变量:
#   IMAGE     镜像仓库地址,默认 ghcr.io/yxrhub/yxrhub.com
#   PLATFORM  目标平台,默认 linux/amd64(传空字符串则用构建机原生平台)
#
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/yxrhub/yxrhub.com}"
PLATFORM="${PLATFORM-linux/amd64}"

PUSH=1
DRY_RUN=0
TAG=""

usage() {
  sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ---------- 参数解析 ----------
while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) PUSH=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "错误: 未知参数 '$1'" >&2; echo >&2; usage >&2; exit 1 ;;
    *)
      if [ -n "$TAG" ]; then
        echo "错误: 只能指定一个标签(已收到 '$TAG' 和 '$1')" >&2
        exit 1
      fi
      TAG="$1"; shift ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# ---------- 前置检查 ----------
command -v docker >/dev/null 2>&1 || { echo "错误: 找不到 docker 命令" >&2; exit 1; }
if [ "$DRY_RUN" -eq 0 ]; then
  docker info >/dev/null 2>&1 || { echo "错误: Docker 守护进程未运行" >&2; exit 1; }
fi

# 仓库根目录(本脚本位于 <root>/scripts/)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f Dockerfile ] || { echo "错误: 在 $ROOT 下找不到 Dockerfile" >&2; exit 1; }

# ---------- 生成标签 ----------
if [ -z "$TAG" ]; then
  TAG="$(date +%Y%m%d%H%M%S)"
  echo "未指定标签,自动生成时间戳: $TAG"
fi

TARGET="$IMAGE:$TAG"
LATEST="$IMAGE:latest"

echo
echo "镜像仓库 : $IMAGE"
echo "本次标签 : $TAG"
echo "目标平台 : ${PLATFORM:-<构建机原生>}"
if [ "$PUSH" -eq 1 ]; then
  echo "是否推送 : 是"
else
  echo "是否推送 : 否"
fi
echo

# ---------- 工作区状态提示 ----------
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "提示: 工作区有未提交的改动,镜像将包含这些内容(而非某个提交的状态)。" >&2
  fi
  echo "构建自提交: $(git rev-parse --short HEAD 2>/dev/null || echo '未知')"
  echo
fi

# ---------- 远端标签冲突提示 ----------
if [ "$DRY_RUN" -eq 0 ] && docker buildx imagetools inspect "$TARGET" >/dev/null 2>&1; then
  echo "警告: 远端已存在标签 $TAG,继续推送将覆盖它。" >&2
  echo
fi

# ---------- 构建 ----------
echo "==> 构建 $TARGET"
BUILD_ARGS=(build -t "$TARGET")
if [ -n "$PLATFORM" ]; then
  BUILD_ARGS+=(--platform "$PLATFORM")
fi
BUILD_ARGS+=(.)
run docker "${BUILD_ARGS[@]}"

# ---------- 打 latest ----------
echo
echo "==> 将 latest 指向本次构建"
run docker tag "$TARGET" "$LATEST"

# ---------- 推送 ----------
if [ "$PUSH" -eq 1 ]; then
  # 先推时间戳标签——latest 是"移动指针",放在最后推,
  # 这样一旦中途失败,latest 仍指向上一个可用版本。
  echo
  echo "==> 推送 $TARGET"
  run docker push "$TARGET"

  echo
  echo "==> 推送 $LATEST"
  run docker push "$LATEST"
fi

# ---------- 结果摘要 ----------
echo
echo "完成。"
if [ "$DRY_RUN" -eq 0 ]; then
  echo "  本地镜像: $TARGET"
  if [ "$PUSH" -eq 1 ] && command -v docker >/dev/null 2>&1; then
    DIGEST="$(docker buildx imagetools inspect "$TARGET" --format '{{.Manifest.Digest}}' 2>/dev/null || true)"
    if [ -n "$DIGEST" ]; then
      echo "  远端摘要: $DIGEST"
    fi
  fi
fi
