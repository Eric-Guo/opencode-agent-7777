import { expect, test, type Page } from "@playwright/test"
import { mockEvents } from "./session.fixture"

const entry = "/component-tests/nexus-chat.html#/workspaces/shared/conversations/"
const scope = JSON.stringify(["origin", "human", "shared", "agent"])

async function fixture(page: Page, text: string) {
  await mockEvents(page)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/api/7777/**", (route) => {
    const { pathname } = new URL(route.request().url())
    const json = (body: unknown) => route.fulfill({ json: body })
    if (pathname.endsWith("/connection"))
      return json({ scope, user: "Human", agent: "OpenCode", workspace: "Shared", model: "m", runner: "r" })
    if (pathname.endsWith("/choices")) return json({ models: [], runners: [], approvals: ["ask"] })
    if (pathname.endsWith("/bytes")) return route.fallback()
    if (!/\/chats\/(first|second)$/.test(pathname)) return json([])
    return json({
      turns: [
        {
          id: "turn",
          input: "input",
          variant: "variant",
          run: null,
          created: 1000,
          position: 1,
          prompt: "Show the plot",
          text,
          status: "completed",
          files: true,
        },
      ],
      pending: [],
      busy: false,
      decisions: [],
      detail: { title: pathname.endsWith("/first") ? "First" : "Second", writable: true },
    })
  })
  await page.goto(entry + "first")
  return errors
}

test("timeline Markdown loads workspace images and remembers the code wrap default", async ({ page }) => {
  const images: URL[] = []
  await page.route("**/bytes?**", (route) => {
    const request = route.request()
    expect(decodeURIComponent(request.headers()["x-7777-scope"])).toBe(scope)
    images.push(new URL(request.url()))
    return route.fulfill({ path: "public/favicon-96x96-v3.png" })
  })
  const errors = await fixture(
    page,
    ["![Workspace plot](figures/plot%20%231.png)", "```text\n" + "0123456789".repeat(50) + "\n```"].join("\n\n"),
  )
  const plot = page.getByAltText("Workspace plot")
  await expect.poll(() => plot.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(96)
  await expect(plot).toHaveAttribute("src", /^blob:/)
  expect(images.map((url) => [url.pathname, ...url.searchParams.values()])).toEqual([
    ["/api/7777/chats/first/bytes", "turn", "variant", "figures/plot #1.png"],
  ])

  const pre = page.locator('[data-component="markdown-code"] > pre')
  const settings = page.getByRole("button", { name: "Conversation preferences" })
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

test("switching conversations cancels the old Markdown image read and resolves the same path again", async ({
  page,
}) => {
  const reading = page.waitForRequest("**/chats/first/bytes?**")
  const release = Promise.withResolvers<void>()
  await page.route("**/bytes?**", async (route) => {
    const first = new URL(route.request().url()).pathname.includes("/first/")
    if (first) await release.promise
    return route
      .fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${first ? 13 : 29}" height="10"/>`,
      })
      .catch(() => undefined)
  })
  try {
    const errors = await fixture(page, "![Workspace plot](figures/plot.svg)")
    const first = await reading
    const cancelled = page.waitForEvent("requestfailed", (request) => request === first)
    await page.goto(entry + "second")
    await expect(page.getByRole("button", { name: "Options for Second" })).toBeVisible()
    const plot = page.getByAltText("Workspace plot")
    await expect.poll(() => plot.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(29)
    await cancelled
    await expect(plot).toHaveAttribute("src", /^data:image\/svg\+xml/)
    expect(errors).toEqual([])
  } finally {
    release.resolve()
  }
})
