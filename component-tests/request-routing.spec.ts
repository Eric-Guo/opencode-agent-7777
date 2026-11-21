import { expect, test } from "@playwright/test"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

test("routes directory requests beyond the recent page and replies to their owning sessions", async ({ page }) => {
  const location = { directory: "/fixture" }
  const session = (id: string, parentID?: string) => ({
    id,
    title: id,
    parentID,
    location,
    agent: "7777",
    projectID: "project",
    time: { created: 1, updated: 1 },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const rows = Array.from({ length: 12 }, (_, i) => session("recent-" + i))
  const child = session("older-child", "root")
  const grandchild = session("older-grandchild", child.id)
  const reads: string[] = []
  const pages: (string | null)[] = []
  const replies: { path: string; body: unknown }[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.assign(window, { api: { awaitInitialization: async () => ({ url: location.origin }) } })
    localStorage.setItem("opencode.7777.session.id", "root")
  })
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path.endsWith("/reply")) {
      replies.push({ path, body: request.postDataJSON() })
      return route.fulfill({ status: 204 })
    }
    if (path === "/api/session") {
      const cursor = url.searchParams.get("cursor")
      pages.push(cursor)
      return json(cursor ? { data: [child, grandchild], cursor: {} } : { data: rows, cursor: { next: "older" } })
    }
    if (path === "/api/session/root") return json({ data: session("root") })
    for (const row of [child, grandchild]) {
      if (path === "/api/session/" + row.id) {
        reads.push(row.id)
        return json({ data: row })
      }
    }
    if (path === "/api/permission/request")
      return json({ data: [{ id: "permission", sessionID: child.id, action: "read", resources: ["fixture.txt"] }] })
    if (path === "/api/form")
      return json({
        data: [
          {
            id: "question",
            title: "Choose a layout",
            sessionID: grandchild.id,
            metadata: { kind: "question" },
            fields: [{ key: "layout", type: "string", options: [{ value: "compact", label: "Compact layout" }] }],
          },
        ],
      })
    if (path === "/api/event") return route.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" })
    if (path === "/api/session/active") return json({ data: {} })
    if (path.endsWith("/message")) return json({ data: [], cursor: {} })
    if (path === "/api/model/default") return json({ location, data: null })
    if (request.method() === "GET") return json({ location, data: [] })
    throw new Error("Unexpected fixture write to " + path)
  })
  await page.goto("/")
  const question = page.getByRole("radio", { name: "Compact layout" })
  const allow = page.getByRole("button", { name: "Allow once" })
  await expect(allow).toBeVisible()
  await expect(question).toBeVisible()
  await allow.click()
  await expect(allow).toBeHidden()
  await question.click()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(question).toBeHidden()
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable()
  expect(replies).toEqual([
    { path: "/api/session/older-child/permission/permission/reply", body: { decision: "once" } },
    { path: "/api/session/older-grandchild/form/question/reply", body: { answer: { layout: "compact" } } },
  ])
  expect(reads.toSorted()).toEqual(["older-child", "older-grandchild"])
  expect(pages).toEqual([null])
  expect(errors).toEqual([])
})
