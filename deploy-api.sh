#!/bin/bash
# ============================================================
# 部署云端存档后端云函数 kids-api（挂到 HTTP 网关 /api）
# 用法: bash deploy-api.sh
#   读 keys.env 的腾讯云密钥；TOKEN_SECRET（会话签名密钥）也存 keys.env（KID_TOKEN_SECRET），首次自动生成。
#   临时 cloudbaserc.json 在仓库根生成（已被 .gitignore 忽略，不泄露密钥）。
#   函数运行时会话密钥来自环境变量 TOKEN_SECRET。
# ============================================================
set -euo pipefail

ROOT=/dat/user_alpha/happy_life/mini_test
KEYFILE=/dat/user_alpha/happy_life/keys.env
source "$KEYFILE"   # TCB_SECRET_ID / TCB_SECRET_KEY / TCB_ENV_ID

# 会话签名密钥：首次生成并持久化到 keys.env（不入 git）
if [ -z "${KID_TOKEN_SECRET:-}" ]; then
  KID_TOKEN_SECRET=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')
  printf '\n# 孩子站云端会话签名密钥（kids-api 用）\nKID_TOKEN_SECRET=%s\n' "$KID_TOKEN_SECRET" >> "$KEYFILE"
  echo "🔑 已生成 TOKEN_SECRET 并写入 keys.env"
fi

cloudbase login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY" >/dev/null 2>&1

cd "$ROOT"

# 生成 cloudbaserc.json（含密钥，仅本地）
EID="$TCB_ENV_ID" TS="$KID_TOKEN_SECRET" node -e '
const fs = require("fs");
const cfg = {
  envId: process.env.EID,
  functionRoot: "./functions",
  functions: [{
    name: "kids-api",
    runtime: "Nodejs20.19",
    handler: "index.main",
    timeout: 10,
    memorySize: 256,
    installDependency: false,
    envVariables: { TCB_ENV_ID: process.env.EID, TOKEN_SECRET: process.env.TS }
  }]
};
fs.writeFileSync(process.cwd() + "/cloudbaserc.json", JSON.stringify(cfg, null, 2));
'

cd "$ROOT"
cloudbase fn deploy kids-api --force --deployMode zip 2>&1 | grep -E '✔|✖|部署成功|Error' | head -5
echo "✅ kids-api 部署完成"
