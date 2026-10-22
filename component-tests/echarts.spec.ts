import { expect, test } from "@playwright/test"
import { lineSource } from "./echarts-data"

const charts = '[data-component="markdown-echarts"]'
const canvas = ".markdown-echarts-canvas"

test("renders detected and explicit charts, preserves source, and leaves other blocks alone", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/component-tests/echarts.html?scenario=mixed")
  const line = page.locator(charts).first()
  await expect(page.locator(`${charts} svg`)).toHaveCount(2)
  for (const text of ["Weekly Active Users", "DAU", "MAU", "Peak", "25"]) {
    await expect(line.locator("svg").getByText(text, { exact: true })).toBeVisible()
  }
  const wrapper = line.locator("..")
  await expect(wrapper.locator("pre")).toBeHidden()
  await line.getByRole("button", { name: "Show source" }).focus()
  await page.keyboard.press("Enter")
  await expect(wrapper.locator("pre")).toBeVisible()
  expect(await wrapper.locator("pre code").textContent()).toBe(lineSource)
  await wrapper.locator('[data-slot="markdown-copy-button"] button').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(lineSource)
  await line.getByRole("button", { name: "Hide source" }).click()
  await expect(wrapper.locator("pre")).toBeHidden()
  await expect(page.locator('[data-language="json"] pre').filter({ hasText: '"hello"' })).toBeVisible()
  await expect(page.locator('[data-component="markdown-mermaid"] svg')).toBeVisible()
  await expect(page.locator('[data-component="user-message"] ' + charts)).toHaveCount(0)

  // Legend hover changes the stroke color; the dashed line itself identifies this series.
  const dashedSeries = line.locator('svg path[stroke-dasharray="8,4"][fill="none"]')
  await expect(dashedSeries).toHaveCount(1)
  await line.locator("svg").getByText("MAU", { exact: true }).click()
  await page.mouse.move(0, 0)
  await expect(dashedSeries).toHaveCount(0)
  await line.locator("svg").getByText("MAU", { exact: true }).click()
  await page.mouse.move(0, 0)
  await expect(dashedSeries).toHaveCount(1)
  const svg = line.locator("svg")
  const bounds = (await svg.boundingBox())!
  await page.mouse.move(bounds.x + 48, bounds.y + 200)
  await expect(svg.getByText("12", { exact: true })).toBeVisible()
  await expect(svg.getByText("22", { exact: true })).toBeVisible()
  const originalWidth = await svg.getAttribute("width")
  await page.getByRole("button", { name: "Toggle width" }).click()
  await expect(svg).not.toHaveAttribute("width", originalWidth!)
  expect(Number(await svg.getAttribute("width"))).toBeLessThanOrEqual(360)
  expect(errors).toEqual([])
})

test("waits for completion, replaces charts, and disposes removed instances", async ({ page }) => {
  await page.goto("/component-tests/echarts.html?scenario=streaming")
  await expect(page.locator('[data-component="text-part"] pre')).toContainText("{")
  await expect(page.locator(charts)).toHaveCount(0)
  await page.getByRole("button", { name: "Finish JSON" }).click()
  await expect(page.locator('[data-component="text-part"] pre')).toContainText('"animationEasing"')
  await expect(page.locator(charts)).toHaveCount(0)
  await page.getByRole("button", { name: "Close fence" }).click()
  await expect(page.locator(`${charts} svg`)).toHaveCount(1)
  const oldCanvas = await page.locator(canvas).elementHandle()
  await page.getByRole("button", { name: "Replace chart" }).click()
  await expect(page.locator(`${charts} svg`).getByText("Pie replacement", { exact: true })).toBeVisible()
  await expect.poll(() => oldCanvas!.getAttribute("_echarts_instance_")).toBe("")
  await expect(page.locator(charts)).toHaveCount(1)
  const replacement = await page.locator(canvas).elementHandle()
  await page.getByRole("button", { name: "Switch session" }).click()
  await expect.poll(() => replacement!.getAttribute("_echarts_instance_")).toBe("")
  await expect(page.locator(`${charts} svg`)).toHaveCount(1)
  const switched = await page.locator(canvas).elementHandle()
  await page.getByRole("button", { name: "Toggle timeline" }).click()
  await expect(page.locator(charts)).toHaveCount(0)
  await expect.poll(() => switched!.getAttribute("_echarts_instance_")).toBe("")
  await page.getByRole("button", { name: "Toggle timeline" }).click()
  await expect(page.locator(`${charts} svg`)).toHaveCount(1)
})

test("renders a valid unclosed fence when the message ends and waits for hidden containers", async ({ page }) => {
  await page.goto("/component-tests/echarts.html?scenario=streaming")
  await page.getByRole("button", { name: "Finish JSON" }).click()
  await page.getByRole("button", { name: "Complete message" }).click()
  await expect(page.locator(`${charts} svg`)).toHaveCount(1)
  await page.goto("/component-tests/echarts.html?scenario=hidden")
  await expect(page.locator(charts)).toHaveCount(1)
  await expect(page.locator(`${charts} svg`)).toHaveCount(0)
  await page.getByRole("button", { name: "Toggle visibility" }).click()
  await expect(page.locator(`${charts} svg`)).toHaveCount(1)
})

test("keeps source readable on invalid options, rendering failure and loading failure", async ({ page }) => {
  for (const scenario of ["invalid", "renderError"]) {
    await page.goto(`/component-tests/echarts.html?scenario=${scenario}`)
    await expect(page.locator(charts).getByRole("alert")).toBeVisible()
    await expect(page.locator('[data-component="text-part"] pre')).toBeVisible()
    await page.getByRole("button", { name: "Replace chart" }).click()
    await expect(page.locator(`${charts} svg`)).toHaveCount(1)
  }
  await page.route(/\/echarts(?:\.js|\/|\?)/, (route) => route.abort())
  await page.goto("/component-tests/echarts.html")
  await expect(page.locator(charts).getByRole("alert")).toBeVisible()
  await expect(page.locator('[data-component="text-part"] pre')).toBeVisible()
})

test("does not download ECharts for ordinary JSON or user message code", async ({ page }) => {
  const requests: string[] = []
  page.on("request", (request) => requests.push(request.url()))
  await page.goto("/component-tests/echarts.html?scenario=plain")
  await expect(page.locator('[data-component="text-part"] pre')).toContainText('"hello"')
  await expect(page.locator(charts)).toHaveCount(0)
  expect(requests.filter((url) => /\/echarts(?:\.js|\/|\?)/.test(url))).toEqual([])
})

test("ignores a stale chart while the library is still loading", async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/echarts(?:\.js|\/|\?)/, async (route) => {
    await pending
    await route.continue()
  })
  await page.goto("/component-tests/echarts.html")
  await expect(page.locator(charts).getByRole("status")).toHaveText("Loading chart…")
  const original = await page.locator(canvas).elementHandle()
  await page.getByRole("button", { name: "Replace chart" }).click()
  await expect(page.locator('[data-component="text-part"] pre')).toContainText("Pie replacement")
  release()
  await expect(page.locator(`${charts} svg`).getByText("Pie replacement", { exact: true })).toBeVisible()
  await expect(page.locator(`${charts} svg`)).toHaveCount(1)
  expect(await original!.getAttribute("_echarts_instance_")).toBeNull()
})
