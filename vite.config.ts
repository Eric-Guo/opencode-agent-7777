import { nexusPlugin } from "./server/middleware"
import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  worker: {
    format: "es",
  },
  plugins: [
    nexusPlugin(),
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
  server: { host: "localhost", port: 4777, strictPort: true, cors: false },
  preview: { host: "localhost", cors: false },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
