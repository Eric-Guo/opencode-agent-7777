import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const serverHost = process.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"
const serverPort = process.env.VITE_OPENCODE_SERVER_PORT ?? "4096"
const serverPassword = process.env.OPENCODE_SERVER_PASSWORD
const serverUsername = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"

export default defineConfig({
  base: "./",
  publicDir: "../app/public",
  plugins: [
    {
      name: "opencode-7777:config",
      config() {
        return {
          resolve: {
            alias: {
              "@": fileURLToPath(new URL("./src", import.meta.url)),
            },
          },
          worker: {
            format: "es",
          },
        }
      },
    },
    {
      name: "opencode-7777:theme-preload",
      transformIndexHtml(html) {
        return html.replace(
          /<script id="oc-theme-preload-script" src="(?:\/|\.\/)oc-theme-preload\.js"><\/script>/,
          `<script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
        )
      },
    },
    tailwindcss(),
    solidPlugin(),
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 4777,
    proxy: {
      "/api": {
        target: `http://${serverHost}:${serverPort}`,
        changeOrigin: true,
        headers: serverPassword
          ? { Authorization: `Basic ${Buffer.from(`${serverUsername}:${serverPassword}`).toString("base64")}` }
          : undefined,
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
