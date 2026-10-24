#!/usr/bin/env node
/**
 * 本地用生产环境变量构建（进 git）。
 * 读取 .env.temporary.prod（gitignore）→ 把 VITE_* 注入 process.env → npm run build。
 *
 * 与 dev-prod-api.mjs 平行：dev 靠 Vite proxy（VITE_*_PROXY_TARGET），
 * build（production）不走 proxy，api.js 的 PROD 分支读 VITE_API_BASE_URL /
 * VITE_STOREFRONT_STICKER_URL，故本脚本只注入这两类 base url（文件里也已包含）。
 *
 * 用法：
 *   npm run build:prod-api
 *
 * 说明：
 * - .env.temporary.prod 不进 git（.gitignore 的 .env.* 忽略；仅 .env.temporary.prod.example 进 git）。
 * - 缺文件时用内置公网默认，与 .env.temporary.prod.example 一致。
 * - 与普通 npm run build 的区别：显式从本地文件注入变量，方便本地把构建临时打到
 *   其它/staging API（改 .env.temporary.prod 即可），不影响团队默认构建。
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.temporary.prod");
const exampleFile = resolve(root, ".env.temporary.prod.example");

/** 无本地文件时的公网默认（与 api.js 硬编码、.env.temporary.prod.example 一致）。 */
const DEFAULTS = {
  VITE_API_BASE_URL: "https://payload.gbmake.com",
  VITE_STOREFRONT_STICKER_URL: "https://g.gbmake.com/api/rom-sticker",
};

function parseEnvText(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let loaded = {};
if (existsSync(envFile)) {
  loaded = parseEnvText(readFileSync(envFile, "utf8"));
  console.log(`[build-prod-api] 已加载 ${envFile}`);
} else {
  console.warn(`[build-prod-api] 未找到 ${envFile}，使用内置公网默认。`);
  console.warn(
    `[build-prod-api] 可复制 .env.temporary.prod.example → .env.temporary.prod 后按需改。`,
  );
  loaded = { ...DEFAULTS };
}

// 注入文件里的 VITE_* 变量（Vite build 会把 process.env 的 VITE_* 编进 import.meta.env）
for (const [key, val] of Object.entries(loaded)) {
  if (key.startsWith("VITE_")) process.env[key] = val;
}

// 补全 build 必需的 base url 缺省
for (const [key, val] of Object.entries(DEFAULTS)) {
  if (!process.env[key]) process.env[key] = val;
}

const need = ["VITE_API_BASE_URL", "VITE_STOREFRONT_STICKER_URL"];
for (const k of need) {
  if (!process.env[k]) {
    console.error(`[build-prod-api] 缺少 ${k}`);
    process.exit(1);
  }
}

console.log("[build-prod-api] 生产构建变量:");
console.log(`  VITE_API_BASE_URL            → ${process.env.VITE_API_BASE_URL}`);
console.log(`  VITE_STOREFRONT_STICKER_URL  → ${process.env.VITE_STOREFRONT_STICKER_URL}`);

// 签名：Node 注入私钥/密码（PowerShell `$env:X=''` 会删掉变量导致 tauri 交互卡死）。
// 密码优先级：环境变量 → .tauri/password（单行，gitignore）→ 空字符串。
const keyFile = resolve(root, ".tauri", "chis-flasher.key");
const passwordFile = resolve(root, ".tauri", "password");
const childEnv = { ...process.env };
if (!childEnv.TAURI_SIGNING_PRIVATE_KEY && existsSync(keyFile)) {
  childEnv.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyFile, "utf8");
  console.log("[build-prod-api] 已加载本地 updater 签名私钥");
}
if (childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD == null) {
  if (existsSync(passwordFile)) {
    childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(passwordFile, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r?\n$/, "");
    console.log("[build-prod-api] 已加载 .tauri/password");
  } else {
    childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "";
    console.log("[build-prod-api] 未找到 .tauri/password，使用空密码");
  }
}
// 避免 Cursor sandbox 把产物写到 Temp\\cursor-sandbox-cache
const localTarget = resolve(root, "src-tauri", "target");
childEnv.CARGO_TARGET_DIR = localTarget;
console.log(`[build-prod-api] CARGO_TARGET_DIR → ${localTarget}`);
console.log("[build-prod-api] 启动 npm run build …");

const child = spawn("npm", ["run", "build"], {
  cwd: root,
  env: childEnv,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
