# 哆啦A梦数字奔跑（count-master）

加减数字的小奔跑游戏。`index.html` 是**压缩成一行的成品**（角色图、背景、铜锣烧都以 base64 内嵌），直接编辑小改 + 部署即可。

- 带 `const GAME_VER = 'x.y.z'`：改完代码跑 `bash bump-version.sh count-master patch` 自动升版三处（index.html / sw.js / manifest.json）。
- `assets-src/` = 该游戏的素材源（从当年的 `asset_work/count-master-chars` 搬来）：
  - `raw/` 角色原始抠图；`final/` 压缩后用于内嵌的图及其 base64 文件（`dora_b64`、`back_b64`、`dorayaki_b64` 等）；
  - `preview_chars.png` 角色总览；`assets/` 是半成品目录。
  - 想换角色 / 改图：在 `final/` 出好压缩图 → 重新压成 base64 嵌回 `index.html`。素材源不会传上云。
- 孩子的进度存在设备 localStorage：以 `cm_` 开头（金币、装扮、关卡收藏等）。
- 一次性归零键：`__wipe_cm = '1'`（想再清一次，改个新值再部署）。
- **只重置当天 30 分钟限时**（不动进度）：改 `index.html` 里 `TIME_SALT` 的值（`'r1'`→`'r2'`→…），然后 `bash bump-version.sh count-master patch` + `bash deploy.sh`。孩子设备下次打开（有网）即重新计 30 分钟。计时键形如 `cm_time_<salt>_<日期>`，与进度键互不干扰。
