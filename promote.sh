#!/bin/bash
# ============================================================
# 发布 = 把待发布包覆盖进正式源 + 全量部署。
# 这是「孩子页面唯一会变」的动作：确认预览真机验证通过后再跑。
# 用法: bash promote.sh v2-accounts --yes
# 做的事: 0) 升三处 SW 缓存名到“现网+1”强制设备拉新版
#         1) 覆盖 site-root/ 与 games/*/
#         2) bash deploy.sh 全量部署（自动 git 提交/推送）
#         3) curl 校验线上
# ============================================================
set -euo pipefail

ROOT=/dat/user_alpha/happy_life/mini_test
PKG_NAME="${1:-v2-accounts}"
PKG="$ROOT/pending/$PKG_NAME"
CONFIRM="${2:-}"
DOMAIN="https://guodudu-d8gs84w5rc5ae8312-1481373223.tcloudbaseapp.com"

[ "$CONFIRM" = "--yes" ] || { echo "❌ 这是发布动作（孩子页面会更新）。真机验证通过后，运行:"; echo "     bash promote.sh $PKG_NAME --yes"; exit 1; }
[ -d "$PKG" ] || { echo "❌ 没有待发布包 $PKG"; exit 1; }

# 0) 升 SW 缓存名：pending 里尾号取 max(pending, 现网)+1（现网可能因回滚比 pending 高）
bump() { # $1 = pending 文件（仓库同路径下必有现网文件）
  local f="$1" live="${1/$PKG\//$ROOT\/}"
  local pn ln nv
  pn=$(grep -oE "var CACHE = [^;]*" "$f" | grep -oE '[0-9]+' | tail -1)
  ln=$(grep -oE "var CACHE = [^;]*" "$live" 2>/dev/null | grep -oE '[0-9]+' | tail -1)
  ln="${ln:-0}"
  nv=$(( (pn > ln ? pn : ln) + 1 ))
  sed -E "s/(var CACHE = .*)[0-9]+(['\"])/\1${nv}\2/" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  echo "   ↳ $(basename "$(dirname "$f")")/sw.js  CACHE 尾号 → $nv"
}
echo "▶ 0) 升 SW 缓存名（高于现网，强制孩子设备自动换代）"
bump "$PKG/games/2048/sw.js"
bump "$PKG/games/count-master/sw.js"
bump "$PKG/site-root/sw.js"

echo "▶ 1) 覆盖正式源"
rsync -a "$PKG/site-root/"/ "$ROOT/site-root/"/
for g in "$PKG"/games/*/; do
  [ -f "$g/index.html" ] || continue
  n=$(basename "$g")
  rsync -a "$g"/ "$ROOT/games/$n"/
  echo "   ↳ $n/"
done

echo "▶ 2) 全量部署（自动 git 提交）"
cd "$ROOT"
bash deploy.sh

echo "▶ 3) 校验线上"
for p in "" "2048/" "count-master/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$DOMAIN/$p")
  echo "   $DOMAIN/$p → $code"
done
if curl -s "$DOMAIN/" | grep -q cloud-account; then
  echo "   大厅已带账号版（检出 cloud-account 引用）"
else
  echo "   ⚠ 大厅未检出 cloud-account，可能还是日常版，请检查"
fi
