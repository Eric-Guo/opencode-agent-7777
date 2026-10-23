import { expect, test } from "@playwright/test"

test("opens Markdown file links with the desktop default application and reports native errors", async ({ page }) => {
  const opened: string[] = []
  let failure = ""
  await page.exposeFunction("openPath", async (path: string) => {
    opened.push(path)
    return failure || undefined
  })
  await page.addInitScript(() => {
    const host = window as typeof window & { openPath: (path: string) => Promise<string | undefined> }
    window.api = { awaitInitialization: async () => ({ url: "http://localhost:4096" }), openPath: host.openPath }
  })
  await page.goto("/component-tests/markdown-links.html")

  const links = [
    ["上海天华撤销生产部门明细.xlsx", "C:/workspace/上海天华撤销生产部门明细.xlsx"],
    ["Encoded workbook", "C:/workspace/报表 #1%.xlsx"],
    ["Relative workbook", "C:/workspace/reports/summary.xlsx"],
    ["Absolute workbook", "/workspace/summary.xlsx"],
    ["Source reference", "C:/workspace/script.ts"],
  ]
  for (const [name, path] of links) {
    await page.getByRole("link", { name, exact: true }).click()
    await expect.poll(() => opened.at(-1)).toBe(path)
  }
  expect(opened).toHaveLength(links.length)

  await page.getByRole("button", { name: "Switch directory" }).click()
  await page.getByRole("link", { name: "Relative workbook", exact: true }).press("Enter")
  await expect.poll(() => opened.at(-1)).toBe("/another-workspace/reports/summary.xlsx")

  failure = "No application is associated with this file"
  await page.getByRole("link", { name: "Absolute workbook", exact: true }).click()
  await expect(page.getByText("Could not open file", { exact: true })).toBeVisible()
  await expect(page.getByText(failure, { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Website", exact: true })).toHaveAttribute(
    "href",
    "https://example.com/report.xlsx",
  )
  await expect(page).toHaveURL(/\/component-tests\/markdown-links.html$/)
})

test("keeps local links inert without a desktop bridge", async ({ page }) => {
  await page.goto("/component-tests/markdown-links.html")
  const link = page.getByRole("link", { name: "上海天华撤销生产部门明细.xlsx", exact: true })
  await link.click()
  await expect(link).toBeVisible()
  await expect(link).not.toHaveAttribute("href")
  await expect(page.locator('[data-component="markdown"]')).not.toHaveAttribute("data-local-links")
  await expect(page).toHaveURL(/\/component-tests\/markdown-links.html$/)
})
