#!/bin/bash
# ============================================================
# 游戏版本号管理：一键升版并同步三处
#   用法: bash bump-version.sh <游戏目录名> [major|minor|patch]
#   例:   bash bump-version.sh count-master patch   # 1.0.0 → 1.0.1
#   游戏目录位于 games/<游戏目录名>/。仅适用于 index.html 里带
#   const GAME_VER = 'x.y.z' 的游戏（现在 count-master 有；
#   2048 没有，需要手动改它 sw.js 里的 CACHE 缓存名换代）。
# 同步位置：
#   games/<game>/index.html   const GAME_VER = 'x.y.z'（游戏菜单角落显示）
#   games/<game>/sw.js        var CACHE = '<game>-vx.y.z'（缓存版本，设备拉新版的开关）
#   games/<game>/manifest.json "version": "x.y.z"
# 改完游戏代码 → 跑本脚本 → bash deploy.sh，设备才会拿到新版。
# ============================================================
set -euo pipefail

ROOT=/dat/user_alpha/happy_life/mini_test
GAME="${1:?用法: bump-version.sh <游戏目录名> [major|minor|patch]}"
PART="${2:-patch}"
DIR="$ROOT/games/$GAME"
[ -d "$DIR" ] || { echo "目录不存在: $DIR"; exit 1; }

CUR=$(grep -oP "const GAME_VER = '\K[0-9]+\.[0-9]+\.[0-9]+" "$DIR/index.html" || true)
[ -n "$CUR" ] || { echo "$DIR/index.html 里没有 GAME_VER 常量"; exit 1; }

IFS=. read -r a b c <<< "$CUR"
case "$PART" in
  major) a=$((a+1)); b=0; c=0 ;;
  minor) b=$((b+1)); c=0 ;;
  patch) c=$((c+1)) ;;
  *) echo "part 只能是 major|minor|patch"; exit 1 ;;
esac
NEW="$a.$b.$c"

sed -i "s/const GAME_VER = '$CUR'/const GAME_VER = '$NEW'/" "$DIR/index.html"
sed -i "s/^var CACHE = '.*';/var CACHE = '${GAME//-/}-v$NEW';/" "$DIR/sw.js"
sed -i "s/\"version\": \"$CUR\"/\"version\": \"$NEW\"/" "$DIR/manifest.json"

echo "✅ $GAME: $CUR → $NEW（index.html / sw.js / manifest.json 已同步）"
echo "   接着跑 bash deploy.sh 部署即可"
