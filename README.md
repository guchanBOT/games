# 孩子游戏站 mini_test

一台机器管理所有孩子网页小游戏，改完代码跑一条命令就上线（腾讯云 CloudBase）。
孩子设备打开就是新版，**不用清缓存**（Service Worker 已是网络优先）。

## 目录结构

| 路径 | 是什么 | 会传上云吗 |
|---|---|---|
| `site-root/` | 线上根：游戏大厅 `index.html`、大厅 PWA(`sw.js`/`manifest.json`/图标)、`test/` 家长预览区 | ✅ 原样 = 线上根 |
| `games/2048/` | 2048 游戏本体（含它自己的 sw/manifest/图标） | ✅ → 线上 `/2048/` |
| `games/count-master/` | 哆啦A梦数字奔跑本体 | ✅ → 线上 `/count-master/` |
| `games/<名>/assets-src/` | 该游戏的**制作素材**（原图、切图等） | ❌ 不会上传 |
| `assets/` | 全站共用素材（如主题曲 mp3） | ❌ 不会上传 |
| `deploy.sh` / `bump-version.sh` | 部署 / 升版脚本 | ❌ 只在本地 |
| 根目录其它 `.md` | 说明文档 | ❌ |

部署规则：`site-root/` 当网站根，`games/` 下每个文件夹 = 线上一个子目录。
**一条红线：上线后 `games/<名>` 这个文件夹名就是网址 `/名/`，永远别再改名、搬动、换路径**（学习机的入口记录和家长的白名单都绑死它，改一次就出一次 404/旧版事故）。

## 日常操作

- **改现有游戏**：编辑 `games/<名>/` 里的文件 → `bash deploy.sh`。
- **加一个新游戏（三步）**：
  1. 在 `games/` 下建文件夹 `games/<名字>/`，放入 `index.html`、`sw.js`、`manifest.json`、`icon-*.png`（照着 2048 / count-master 抄即可）。
  2. 在 `site-root/index.html` 的"游戏大厅"里加一张卡片，`href` 填 `./<名字>/`。
  3. `bash deploy.sh`。
- **发布前预览**：把要预览的那一版拷到 `site-root/test/<名字>/`（家长自用，大厅里没有入口），`bash deploy.sh` 会一起上传 → 打开 `https://…/test/<名字>/` 看效果。

## 版本号 / 换代

每个游戏的 `sw.js` 顶部有缓存名（如 `countmaster-v1.0.1`、`game2048-v3`）。
缓存名一变，孩子设备就自动拉新版、清旧缓存。

- 带 `const GAME_VER = 'x.y.z'` 的游戏（现为 count-master）：改完代码跑 `bash bump-version.sh <名字> patch`，自动同步 index.html / sw.js / manifest.json 三处。
- 不带 GAME_VER 的游戏（现为 2048）：改完代码要**手动**把 `sw.js` 里的缓存名数字加一，再部署。

## 备份

整个 `mini_test` 是一个 git 仓库（推送备份到 GitHub guchanBOT/games，需环境里有写入权限时才成功）。
代码、素材、脚本都在仓库里。手动提交用固定身份：

```bash
git add -A
git -c user.name=guchanBOT -c user.email=guchanBOT@users.noreply.github.com \
    commit -m "说明"
```
