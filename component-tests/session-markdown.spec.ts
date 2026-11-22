import type { SessionMessageInfo } from "@opencode/client/promise"
import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

function markdownHistory(text: string): SessionMessageInfo[] {
  return [
    { id: "user-1", type: "user", text: "Show the plot", time: { created: 1 } },
    {
      id: "answer-1",
      type: "assistant",
      agent: "7777",
      model: { id: "fixture", providerID: "fixture" },
      content: [{ type: "text", text }],
      time: { created: 2, completed: 3 },
    },
  ]
}

test("timeline Markdown loads workspace images and remembers the code wrap default", async ({ page }) => {
  const images: URL[] = []
  await page.route("**/api/fs/read/**", (route) => {
    images.push(new URL(route.request().url()))
    return route.fulfill({ path: "public/favicon-96x96-v3.png" })
  })
  const text = [
    "![Workspace plot](figures/plot%20%231.png)",
    "![Other workspace](C:/elsewhere/plot.png)",
    "```text\n" + "0123456789".repeat(50) + "\n```",
  ].join("\n\n")
  const { errors } = await setupSession(page, undefined, markdownHistory(text))
  const plot = page.getByAltText("Workspace plot")
  await expect.poll(() => plot.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(96)
  await expect(plot).toHaveAttribute("src", /^blob:/)
  expect(images.map((url) => [url.pathname, url.searchParams.get("location[directory]")])).toEqual([
    ["/api/fs/read/figures/plot%20%231.png", "C:\\Work\\Agent"],
  ])
  await expect(page.getByAltText("Other workspace")).not.toHaveAttribute("src")

  const pre = page.locator('[data-component="markdown-code"] > pre')
  const settings = page.getByRole("button", { name: "Follow-up behavior" })
  const wrap = page.getByRole("menuitemcheckbox", { name: "Wrap code blocks" })
  await expect(pre).toHaveCSS("white-space", "pre")
  await settings.click()
  await expect(wrap).not.toBeChecked()
  await wrap.click()
  await expect(pre).toHaveCSS("white-space", "pre-wrap")
  await pre.hover()
  await page.getByRole("button", { name: "Don't wrap lines" }).click()
  await expect(pre).toHaveCSS("white-space", "pre")
  expect(images).toHaveLength(1)

  await page.reload()
  await expect(pre).toHaveCSS("white-space", "pre-wrap")
  await settings.click()
  await expect(wrap).toBeChecked()
  await wrap.click()
  await expect(pre).toHaveCSS("white-space", "pre")
  expect(errors).toEqual([])
})

test("switching sessions cancels the old Markdown image read and resolves the same path again", async ({ page }) => {
  const history = markdownHistory("![Workspace plot](figures/plot.svg)")
  const reading = page.waitForRequest("**/api/fs/read/figures/plot.svg?**")
  const release = Promise.withResolvers<void>()
  await page.route("**/api/fs/read/**", async (route) => {
    const directory = new URL(route.request().url()).searchParams.get("location[directory]")
    const first = directory === "C:\\Work\\Agent"
    if (first) await release.promise
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${first ? 13 : 29}" height="10"/>`,
    })
  })
  try {
    const { errors } = await setupSession(page, undefined, history)
    const first = await reading
    const cancelled = page.waitForEvent("requestfailed", (request) => request === first)
    await page.route("**/api/session/ses_1/message?**", (route) =>
      route.fulfill({ json: { data: history.toReversed(), cursor: {} } }),
    )
    await page.getByRole("button", { name: "Recent sessions", exact: true }).click()
    await page.getByRole("option", { name: /Second/ }).click()
    await expect(page.getByRole("button", { name: "Options for Second" })).toBeVisible()
    const plot = page.getByAltText("Workspace plot")
    await expect.poll(() => plot.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(29)
    release.resolve()
    await cancelled
    await expect(plot).toHaveAttribute("src", /^data:image\/svg\+xml/)
    expect(errors).toEqual([])
  } finally {
    release.resolve()
  }
})
