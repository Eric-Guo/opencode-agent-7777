import { middleware } from "./server/middleware"
import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite"
import solidPlugin from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const loopback = { host: "localhost", port: 4779, strictPort: true, cors: false }

function nexusPlugin(): Plugin {
  let env: Record<string, string> = {}
  const serve = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use(middleware(() => ({ token: env.NEXUS_MEMBER_TOKEN, home: env.RHO_HOME })))
  }

  return {
    name: "nexus-bridge",
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir, ["NEXUS_MEMBER_TOKEN", "RHO_HOME"])
    },
    configureServer: serve,
    configurePreviewServer: serve,
  }
}

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
  server: loopback,
  preview: loopback,
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
