import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

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
