#!/bin/bash
# ============================================================
# 把「待发布包」摊到线上测试路径 /test/<包名>/（家长自用，孩子看不到、也不影响孩子）
# 测试区规则：/test 一级不放游戏本体；一个目录 = 一个自洽的「预览单元」，
#             目录名 = 待发布包名（test/v2-accounts/ ←→ pending/v2-accounts）。
# 孩子路径（/、/2048/、/count-master/）一律不碰 —— 预览半残也不影响孩子玩。
# 用法: bash preview.sh [包名]      默认包: pending/v2-accounts
# 改名后要清掉旧目录：cloudbase hosting delete --dir /test/<旧名> -e <env>
# ============================================================
set -euo pipefail

ROOT=/dat/user_alpha/happy_life/mini_test
PKG_NAME="${1:-v2-accounts}"
PKG="$ROOT/pending/$PKG_NAME"
KEYFILE=/dat/user_alpha/happy_life/keys.env
DOMAIN="https://guodudu-d8gs84w5rc5ae8312-1481373223.tcloudbaseapp.com"

[ -d "$PKG" ] || { echo "❌ 没有待发布包 $PKG（目录名 = 包名）"; exit 1; }
set -a; source "$KEYFILE"; set +a

echo "▶ 组装预览树 /test/（保留入口 index + 各原型单元 + 新增 $PKG_NAME/）"
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
rsync -a "$ROOT/site-root/test"/ "$STAGE"/            # index.html + 常驻单元（如 sky100）原样带上
mkdir -p "$STAGE/$PKG_NAME"
cp "$PKG/site-root/index.html"    "$STAGE/$PKG_NAME/index.html"
cp "$PKG/site-root/sw.js"         "$STAGE/$PKG_NAME/sw.js"
cp "$PKG/site-root/manifest.json" "$STAGE/$PKG_NAME/" 2>/dev/null || true
for i in "$PKG/site-root"/lobby-icon-*.png; do [ -e "$i" ] && cp "$i" "$STAGE/$PKG_NAME/"; done
for g in "$PKG"/games/*/; do
  [ -f "$g/index.html" ] || continue
  name=$(basename "$g")
  mkdir -p "$STAGE/$PKG_NAME/$name"
  rsync -a --exclude 'assets-src' --exclude 'README.md' "$g"/ "$STAGE/$PKG_NAME/$name"/
  echo "   ↳ $name/"
done

# 公共库放根 /js/cloud-account.js：游戏/大厅用绝对路径 /js/ 引用。
# 这一步只是“新增一个没有任何孩子页面引用的文件”，对现网零影响。
if [ -f "$PKG/site-root/js/cloud-account.js" ]; then
  JS=$(mktemp -d); trap 'rm -rf "$STAGE" "$JS"' EXIT
  mkdir -p "$JS/js"
  cp "$PKG/site-root/js/cloud-account.js" "$JS/js/cloud-account.js"
fi

cloudbase login --cloudbase-api-key "$TCB_CLOUDBASE_API_KEY" -e "$TCB_ENV_ID" >/dev/null
echo "▶ 增量上传（不删任何远端文件）"
cloudbase hosting deploy "$STAGE" /test/ -e "$TCB_ENV_ID" >/dev/null
[ -n "${JS:-}" ] && cloudbase hosting deploy "$JS" / -e "$TCB_ENV_ID" >/dev/null

echo "✅ 预览已上线（孩子路径未动）"
echo "   测试区入口:   $DOMAIN/test/"
echo "   预览大厅:     $DOMAIN/test/$PKG_NAME/"
for g in "$PKG"/games/*/; do
  [ -f "$g/index.html" ] || continue
  echo "   ↳ $DOMAIN/test/$PKG_NAME/$(basename "$g")/"
done
