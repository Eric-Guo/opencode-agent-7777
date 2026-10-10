import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"
import { defineConfig, type Plugin } from "vite"
import solidPlugin from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const serverHost = process.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"
const serverPort = process.env.VITE_OPENCODE_SERVER_PORT ?? "4096"
const serverPassword = process.env.OPENCODE_SERVER_PASSWORD
const serverUsername = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"

// Like the main app, omit Office engines emitted from imports that tree shaking removed.
const dropUnloadedOfficeFiles: Plugin = {
  name: "opencode-plm-meeting:drop-unloaded-office-files",
  apply: "build",
  generateBundle: {
    order: "post",
    handler(_, bundle) {
      const files = Object.values(bundle).filter((file) => !file.fileName.endsWith(".map"))
      const name = (file: (typeof files)[number]) => file.fileName.split("/").pop() ?? file.fileName
      const source = (file: (typeof files)[number]) =>
        file.type === "chunk" ? file.code : typeof file.source === "string" ? file.source : ""

      files
        .filter(
          (file) =>
            /^(?:docx_\w+_bg|ooxml_opc_bg|pptx_wasm_bg|xlsx_wasm_bg|residentEngineWorker)\b/.test(name(file)) &&
            !files.some((other) => other !== file && source(other).includes(name(file))),
        )
        .forEach((file) => {
          delete bundle[file.fileName]
          delete bundle[`${file.fileName}.map`]
        })
    },
  },
}

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "opencode-plm-meeting:config",
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
          // Pre-bundling moves import.meta.url away from the Office WASM and font assets.
          optimizeDeps: {
            exclude: [
              "@betteroffice/docx",
              "@betteroffice/fonts",
              "@betteroffice/fonts-cjk",
              "@betteroffice/pptx",
              "@betteroffice/xlsx",
            ],
          },
        }
      },
    },
    dropUnloadedOfficeFiles,
    {
      name: "opencode-plm-meeting:theme-preload",
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
    port: 4778,
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
