#!/usr/bin/env node
/**
 * 临时生产 API 启动器（进 git）。
 * 读取 .env.temporary.prod（gitignore）→ 注入 process.env → 释放 :1420 → npm run dev
 *
 * 用法：
 *   npm run dev:prod-api
 *
 * 注意：tauri 的 vite:single 会复用已在 1420 上的旧 Vite；
 * 若不先清端口，代理仍可能指向上次的 localhost:1145。
 */
import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.temporary.prod");
const exampleFile = resolve(root, ".env.temporary.prod.example");

/** 无本地文件时的公网默认（与 .env.temporary.prod.example 一致）。 */
const DEFAULTS = {
  VITE_PAYLOAD_PROXY_TARGET: "https://payload.gbmake.com",
  VITE_API_PROXY_TARGET: "https://payload.gbmake.com",
  VITE_STICKER_PROXY_TARGET: "https://g.gbmake.com",
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
} else {
  console.warn(`[dev-prod-api] 未找到 ${envFile}`);
  console.warn(
    `[dev-prod-api] 使用内置公网默认。可复制 example 后按需改：`,
  );
  console.warn(
    `  复制 .env.temporary.prod.example → .env.temporary.prod` +
      (existsSync(exampleFile) ? "" : "  （仓库里应有 .env.temporary.prod.example）"),
  );
  loaded = { ...DEFAULTS };
}

for (const [key, val] of Object.entries(loaded)) {
  process.env[key] = val;
}

// 补全缺省键
for (const [key, val] of Object.entries(DEFAULTS)) {
  if (!process.env[key]) process.env[key] = val;
}

process.env.CHIS_TEMP_PROD_API = process.env.CHIS_TEMP_PROD_API || "1";

const need = ["VITE_PAYLOAD_PROXY_TARGET", "VITE_STICKER_PROXY_TARGET"];
for (const k of need) {
  if (!process.env[k]) {
    console.error(`[dev-prod-api] 缺少 ${k}`);
    process.exit(1);
  }
}

/** 释放 1420，避免 vite:single 复用仍指向 localhost 的旧进程。 */
function freeVitePort() {
  const isWin = process.platform === "win32";
  try {
    if (isWin) {
      execSync(
        `powershell -NoProfile -Command "` +
          `Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | ` +
          `ForEach-Object { if ($_.OwningProcess -and $_.OwningProcess -ne 0) { ` +
          `Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync("fuser -k 1420/tcp 2>/dev/null || true", {
        stdio: "ignore",
        shell: true,
      });
    }
  } catch {
    // 端口本就空闲时忽略
  }
}

console.log("[dev-prod-api] 临时生产代理:");
console.log(`  payload/api → ${process.env.VITE_PAYLOAD_PROXY_TARGET}`);
console.log(`  sticker     → ${process.env.VITE_STICKER_PROXY_TARGET}`);
console.log("[dev-prod-api] 释放 :1420 后启动 npm run dev …");

freeVitePort();

const child = spawn("npm", ["run", "dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
