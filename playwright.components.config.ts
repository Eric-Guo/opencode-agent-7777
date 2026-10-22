import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4787)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./component-tests",
  outputDir: "./component-tests/test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    channel: process.platform === "darwin" && !process.env.CI ? "chrome" : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/component-tests/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
  },
})
