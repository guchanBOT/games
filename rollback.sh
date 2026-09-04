#!/bin/bash
# ============================================================
# 回滚：把「上一个自动部署提交」的内容重新传到线上，并同步 git。
# 孩子下次打开/刷新即恢复成上一版，学习机端无需任何操作。
# 用法: bash rollback.sh            （默认回上一版）
#       bash rollback.sh <commit>   （回指定提交）
# ============================================================
set -euo pipefail

ROOT=/dat/user_alpha/happy_life/mini_test
DOMAIN="https://guodudu-d8gs84w5rc5ae8312-1481373223.tcloudbaseapp.com"
TARGET="${1:-}"
KEYFILE=/dat/user_alpha/happy_life/keys.env

# 默认取“第二新的自动部署提交”（最新一次自动部署=正在线上的坏版本时，回它前一个）
if [ -z "$TARGET" ]; then
  TARGET=$(git -C "$ROOT" log --oneline --grep='^自动部署' --skip=1 -1 | cut -d' ' -f1)
fi
[ -n "$TARGET" ] || { echo "❌ 找不到可回滚的历史版本"; exit 1; }

# 正式区有未提交改动会挡（防止把半成品卷进去）；要回滚得先 stash/提交
chg=$(git -C "$ROOT" status --porcelain -- site-root games)
[ -n "$chg" ] && { echo "⚠ site-root/games 有未提交改动，先提交或 stash 再回滚："; echo "$chg"; exit 1; }

echo "▶ 用 $TARGET 覆盖 site-root + games 并部署"
git -C "$ROOT" checkout "$TARGET" -- site-root games

cd "$ROOT"
bash deploy.sh --skip-git
set -a; source "$KEYFILE"; set +a
git -C "$ROOT" -c user.name="guchanBOT" -c user.email="guchanBOT@users.noreply.github.com" \
    commit -q -am "回滚到 $TARGET" || true
git -C "$ROOT" push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/guchanBOT/games.git" main || echo "(GitHub 推送失败，可稍后手动处理)"

echo "✅ 已回滚到 $TARGET"
for p in "" "2048/" "count-master/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$DOMAIN/$p")
  echo "   $DOMAIN/$p → $code"
done
