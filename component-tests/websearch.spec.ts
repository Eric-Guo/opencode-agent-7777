import { expect, test, type Page } from "@playwright/test"

const options = [
  { id: "exa", name: "Exa" },
  { id: "parallel", name: "Parallel" },
]

async function consent(page: Page, pending: string[], failFirstLoad = false) {
  const replies: { path: string; answer: unknown }[] = []
  const lookups: string[] = []
  const directories: (string | null)[] = []
  await page.route("**/fixture-api/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith("/websearch/provider")) {
      directories.push(url.searchParams.get("location[directory]"))
      if (failFirstLoad && directories.length === 1) return route.abort()
      return route.fulfill({ json: { data: options } })
    }
    if (url.pathname.endsWith("/form")) {
      lookups.push(url.pathname)
      const choices = options.filter((p) => pending.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))
      const form = {
        id: "provider",
        sessionID: "child",
        title: "Web search",
        metadata: { kind: "websearch.provider" },
        fields: [{ key: "provider", type: "string", options: choices }],
      }
      return route.fulfill({ json: { data: pending.length ? [form] : [] } })
    }
    if (url.pathname.endsWith("/reply")) {
      replies.push({ path: url.pathname, answer: request.postDataJSON().answer })
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: { data: [] } })
  })
  await page.goto("/component-tests/index.html?prompt=websearch")
  const dock = page.getByRole("region", { name: "Third-party web search" })
  return {
    dock,
    replies,
    lookups,
    directories,
    select: async (name: string) => {
      await dock.getByRole("button", { name: /Search provider/ }).click()
      await page.getByRole("option", { name, exact: true }).click()
    },
    enable: dock.getByRole("button", { name: "Enable" }),
    message: page.getByRole("textbox", { name: "Message" }),
  }
}

test("recovers a missing provider event through the child session and confirms changed options", async ({ page }) => {
  const f = await consent(page, ["exa"])
  await expect(f.message).toBeDisabled()
  await f.select("Parallel")
  await f.enable.click()
  await expect(f.dock.getByText("That search provider is no longer available. Choose another.")).toBeVisible()
  await expect(f.dock.getByRole("button", { name: /Search provider/ })).toContainText("Exa")
  await expect(f.dock.getByRole("button", { name: "Don’t use search" })).toHaveCount(0)
  expect(f.replies).toEqual([
    { path: "/fixture-api/api/session/child/form/consent/reply", answer: { choice: "choose" } },
  ])
  expect(f.lookups).toEqual(["/fixture-api/api/session/child/form"])
  expect(f.directories).toEqual(["/fixture/child"])
  await f.enable.click()
  await expect(f.message).toBeEnabled()
  expect(f.replies[1]).toEqual({
    path: "/fixture-api/api/session/child/form/provider/reply",
    answer: { provider: "exa" },
  })
})

test("a refreshed provider form retains an available choice and replaces a removed one", async ({ page }) => {
  const pending = ["exa"]
  const f = await consent(page, pending)
  await f.select("Parallel")
  await f.enable.click()
  await expect(f.dock.getByText("That search provider is no longer available. Choose another.")).toBeVisible()
  pending.push("parallel")
  const refresh = page.getByRole("button", { name: "Refresh pending forms" })
  await refresh.click()
  await f.select("Parallel")
  await expect(f.dock.getByRole("button", { name: /Search provider/ })).toContainText("Parallel")
  pending.pop()
  await refresh.click()
  await expect(f.dock.getByRole("button", { name: /Search provider/ })).toContainText("Exa")
  await expect(f.dock.getByText("That search provider is no longer available. Choose another.")).toBeVisible()
  expect(f.replies.map((reply) => reply.answer)).toEqual([{ choice: "choose" }])
})

test("releases the composer when the second form never arrives", async ({ page }) => {
  await page.clock.install()
  const f = await consent(page, [])
  await f.select("Parallel")
  await f.enable.click()
  await expect.poll(() => f.lookups.length).toBe(1)
  await expect(f.message).toBeDisabled()
  await page.clock.fastForward(10_000)
  await expect(f.message).toBeEnabled()
  await expect(f.dock).toHaveCount(0)
  expect(f.replies.map((reply) => reply.answer)).toEqual([{ choice: "choose" }])
})

for (const action of ["allow", "disable"]) {
  test(`provider load failure keeps retry and ${action} on the consent form`, async ({ page }) => {
    const f = await consent(page, [], true)
    await expect(f.dock.getByText("Could not load search providers.")).toBeVisible()
    await expect(f.enable).toBeDisabled()
    if (action === "allow") {
      await f.dock.getByRole("button", { name: "Retry" }).click()
      await expect(f.dock.getByRole("button", { name: /Search provider/ })).toContainText("Any")
      await f.enable.click()
    } else {
      await f.dock.getByRole("button", { name: "Don’t use search" }).click()
    }
    await expect(f.message).toBeEnabled()
    expect(f.replies.map((reply) => reply.answer)).toEqual([{ choice: action }])
    expect(f.lookups).toEqual([])
  })
}
