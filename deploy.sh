#!/bin/bash
# ============================================================
# 孩子游戏网站一键部署到腾讯云 CloudBase
# 用法: bash deploy.sh [--skip-git]
#   本地结构（mini_test 是 git 整仓，也是"游戏库"）:
#     site-root/            → 线上根目录（大厅 index.html + 大厅 PWA + test/ 预览区）
#     games/<游戏名>/       → 每个游戏一个目录，游戏本体就在里面
#                             games/<游戏名>/assets-src = 制作素材，不会上传
#     assets/               → 全站共用素材，不上传
#   本脚本把两者拼成线上结构（games/<名> → 线上 /<名>/）再全量上传，
#   所以目录名即网址路径：<游戏名> 上线后绝不能再改名/搬动。
#   新增游戏 = games/ 下建目录 → 大厅加卡片 → 跑本脚本即可。
# 密钥: /dat/user_alpha/happy_life/keys.env
# ============================================================
set -euo pipefail

ROOT=/dat/user_alpha/happy_life/mini_test
KEYFILE=/dat/user_alpha/happy_life/keys.env
source "$KEYFILE"   # TCB_SECRET_ID / TCB_SECRET_KEY / TCB_ENV_ID

# 本地未提交的改动先看一眼（防止漏传）
git -C "$ROOT" status --short | grep -v '^??' || true

# 组装"线上结构"到临时目录：site-root 当网站根，每个游戏铺成根下的子目录
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
rsync -a --exclude '.git' "$ROOT/site-root"/ "$STAGE"/
for g in "$ROOT"/games/*/; do
  [ -f "$g/index.html" ] || continue   # 跳过非游戏条目（说明/模板）
  name=$(basename "$g")
  # 排除制作素材(assets-src)和维护文档(README.md)，它们不上线
  rsync -a --exclude 'assets-src' --exclude 'README.md' "$g" "$STAGE/$name/"
  echo "   ↳ 打包游戏: $name/ → 线上 /$name/"
done

cloudbase login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY" >/dev/null
cloudbase hosting deploy "$STAGE" / -e "$TCB_ENV_ID" >/dev/null

# 顺手同步 GitHub 备用仓库
if [ "${1:-}" != "--skip-git" ]; then
  git -C "$ROOT" add -A
  git -C "$ROOT" -c user.name="guchanBOT" -c user.email="guchanBOT@users.noreply.github.com" \
      commit -q -m "自动部署: $(date +%F\ %T)" || echo "(GitHub 无改动，跳过提交)"
  git -C "$ROOT" push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/guchanBOT/games.git" main || echo "(GitHub 推送失败，可稍后手动处理)"
fi

DOMAIN="https://dudu-d5ggdwobce3add3f0-1300661794.tcloudbaseapp.com"
echo "✅ 部署完成: $DOMAIN"

# 测试区入口：只给家长自用（大厅里没有任何链接指进来）
echo "🧪 测试区（家长自用，孩子看不到入口）: $DOMAIN/test/"
for g in "$ROOT"/site-root/test/*/index.html; do
  [ -e "$g" ] && echo "   ↳ $DOMAIN/test/$(basename "$(dirname "$g")")/"
done
