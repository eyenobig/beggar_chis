import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const verifyFile = resolve(__dirname, ".chis-verify.json");

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

// https://vitejs.dev/config/
export default defineConfig({
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
  },
});
