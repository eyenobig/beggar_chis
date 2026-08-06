import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const verifyFile = resolve(__dirname, ".chis-verify.json");
const DEFAULT_PAYLOAD_PROXY = "http://localhost:1145";
const DEFAULT_STICKER_PROXY = "http://localhost:8000";

function chisVerifyPlugin() {
  return {
    name: "chis-verify",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__chis_verify")) return next();
        if (req.method === "POST") {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            try {
              writeFileSync(verifyFile, Buffer.concat(chunks).toString("utf8"), "utf8");
              res.statusCode = 200;
              res.end("ok");
            } catch (e) {
              res.statusCode = 500;
              res.end(String(e));
            }
          });
          return;
        }
        if (req.method === "GET") {
          if (!existsSync(verifyFile)) {
            res.statusCode = 404;
            res.end("{}");
            return;
          }
          res.setHeader("content-type", "application/json");
          res.end(readFileSync(verifyFile, "utf8"));
          return;
        }
        next();
      });
    },
  };
}

/** 解析 .env 风格文件（仅 KEY=VAL；供临时生产文件使用）。 */
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, __dirname, "");
  const tempProd =
    process.env.CHIS_TEMP_PROD_API === "1" || process.env.CHIS_TEMP_PROD_API === "true"
      ? parseEnvFile(resolve(__dirname, ".env.temporary.prod"))
      : {};

  // /payload-api 与 /api 共用同一 target（前端走 /payload-api，代理 rewrite 后日志常显示 /api/...）
  const payloadTarget = firstNonEmpty(
    process.env.VITE_PAYLOAD_PROXY_TARGET,
    process.env.VITE_API_PROXY_TARGET,
    tempProd.VITE_PAYLOAD_PROXY_TARGET,
    tempProd.VITE_API_PROXY_TARGET,
    fileEnv.VITE_PAYLOAD_PROXY_TARGET,
    fileEnv.VITE_API_PROXY_TARGET,
    DEFAULT_PAYLOAD_PROXY,
  );
  const stickerTarget = firstNonEmpty(
    process.env.VITE_STICKER_PROXY_TARGET,
    tempProd.VITE_STICKER_PROXY_TARGET,
    fileEnv.VITE_STICKER_PROXY_TARGET,
    DEFAULT_STICKER_PROXY,
  );

  console.log(`[vite] proxy /payload-api,/api → ${payloadTarget}`);
  console.log(`[vite] proxy /sticker-api → ${stickerTarget}`);

  return {
    plugins: [vue(), chisVerifyPlugin()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: "ws", host, port: 1421 }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
      proxy: {
        // dev 默认打本地后端（1145/8000），可用 VITE_*_PROXY_TARGET 或 npm run dev:prod-api 覆盖到公网。
        "/payload-api": {
          target: payloadTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/payload-api/, ""),
        },
        // 与 payload 同源；兼容直打 /api/*，并与 rewrite 后的错误日志路径一致。
        "/api": {
          target: payloadTarget,
          changeOrigin: true,
        },
        "/sticker-api": {
          target: stickerTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sticker-api/, "/api/rom-sticker"),
        },
      },
    },
  };
});
