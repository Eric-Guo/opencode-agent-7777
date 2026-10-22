import { expect, test } from "@playwright/test"
import { lineSource, zoomSource } from "./echarts-data"

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

test("reset restores authored zoom and legend state without changing source or another chart", async ({ page }) => {
  await page.goto("/component-tests/echarts.html?scenario=reset")
  const line = page.locator(charts).first()
  const other = page.locator(charts).nth(1).locator(canvas)
  await expect(page.locator(`${charts} svg`)).toHaveCount(2)
  const otherID = await other.getAttribute("_echarts_instance_")
  const dashedSeries = line.locator('svg path[stroke-dasharray="8,4"][fill="none"]')
  await expect(dashedSeries).toHaveCount(0)
  const geometry = () =>
    line
      .locator("svg")
      .evaluate((svg) => Array.from(svg.querySelectorAll("path")).map((path) => path.getAttribute("d")))
  const initial = await geometry()
  const originalID = await line.locator(canvas).getAttribute("_echarts_instance_")
  const box = (await line.locator(canvas).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await expect.poll(geometry).not.toEqual(initial)
  await line.locator("svg").getByText("MAU", { exact: true }).click()
  await page.mouse.move(0, 0)
  await expect(dashedSeries).toHaveCount(1)
  await line.getByRole("button", { name: "Show source", exact: true }).click()
  const source = line.locator("..").locator("pre code")
  await expect(source).toBeVisible()
  expect(await source.textContent()).toBe(zoomSource)

  await line.getByRole("button", { name: "Reset", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(dashedSeries).toHaveCount(0)
  await expect.poll(geometry).toEqual(initial)
  await expect(line.locator(canvas)).not.toHaveAttribute("_echarts_instance_", originalID!)
  await expect(line.getByRole("button", { name: "Hide source", exact: true })).toBeVisible()
  await expect(source).toBeVisible()
  expect(await source.textContent()).toBe(zoomSource)
  await expect(other).toHaveAttribute("_echarts_instance_", otherID!)
  await line.getByRole("button", { name: "Reset", exact: true }).click()
  await expect.poll(geometry).toEqual(initial)
  await expect(line.locator("svg")).toHaveCount(1)
})

test("reset clears dragged graph positions and roaming", async ({ page }) => {
  await page.goto("/component-tests/echarts.html?scenario=reset")
  const graph = page.locator(charts).nth(1)
  const surface = graph.locator(canvas)
  await expect(graph.locator("svg")).toBeVisible()
  await surface.scrollIntoViewIfNeeded()
  const node = graph.locator('svg path[fill="#11aa77"]')
  await expect(node).toBeVisible()
  await node.hover()
  const position = () =>
    node.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const chart = el.closest("svg")!.getBoundingClientRect()
      return { x: box.x - chart.x, y: box.y - chart.y, width: box.width, height: box.height }
    })
  const initial = await position()
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 45, { steps: 6 })
  await expect.poll(position).not.toEqual(initial)
  await page.mouse.up()
  await expect.poll(position).not.toEqual(initial)
  await graph.getByRole("button", { name: "Reset", exact: true }).click()
  await expect.poll(position).toEqual(initial)

  await surface.scrollIntoViewIfNeeded()
  const bounds = (await surface.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 35, { steps: 6 })
  await page.mouse.up()
  await expect.poll(position).not.toEqual(initial)
  await page.mouse.wheel(0, -300)
  await expect.poll(async () => (await position()).width).not.toBe(initial.width)
  await graph.getByRole("button", { name: "Reset", exact: true }).click()
  await expect.poll(position).toEqual(initial)
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
