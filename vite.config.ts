import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

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
          '<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>',
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
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
