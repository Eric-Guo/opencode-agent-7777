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
  const globalDirectories: (string | undefined)[] = []
  let retry = true
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
    if (path.endsWith("/reply") || request.method() === "DELETE") {
      if (path.endsWith("/details/reply") && retry) {
        retry = false
        return route.fulfill({ status: 503, body: "Try again" })
      }
      if (path.includes("/global/")) globalDirectories.push(request.headers()["x-opencode-directory"])
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
        location,
        data: [
          {
            id: "external",
            sessionID: "global",
            title: "Connect account",
            metadata: { kind: "mcp-elicitation", message: "Finish in your browser." },
            fields: [{ key: "elicitation", type: "external", url: "https://example.org/connect?token=(demo)" }],
          },
          {
            id: "ignore",
            sessionID: rows[0].id,
            title: "Unrelated request",
            metadata: { kind: "mcp-elicitation" },
            fields: [{ key: "q", type: "string" }],
          },
          {
            id: "root-input",
            sessionID: "root",
            title: "Root input",
            metadata: { kind: "mcp-elicitation" },
            fields: [{ key: "q", type: "string", required: true }],
          },
          {
            id: "question",
            title: "Choose a layout",
            sessionID: grandchild.id,
            metadata: { kind: "question" },
            fields: [{ key: "layout", type: "string", options: [{ value: "compact", label: "Compact layout" }] }],
          },
          {
            id: "details",
            sessionID: grandchild.id,
            title: "Export preferences",
            metadata: { kind: "mcp-elicitation", message: "Choose how to export." },
            fields: [
              { key: "name", title: "Name", type: "string", required: true },
              { key: "count", title: "Copies", type: "integer", default: 2, minimum: 1 },
              { key: "scale", title: "Scale", type: "number", default: 0.5 },
              { key: "share", title: "Share", type: "boolean", default: true },
              { key: "format", title: "Format", type: "string", options: [{ value: "pdf", label: "PDF" }] },
              {
                key: "colors",
                title: "Colors",
                type: "multiselect",
                required: true,
                options: [{ value: "red", label: "Red" }],
              },
              {
                key: "notes",
                title: "Notes",
                type: "string",
                default: "private",
                when: [{ key: "share", op: "eq", value: true }],
              },
              { key: "hidden", type: "string", hidden: true, default: "private" },
            ],
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
  const root = page.getByRole("form", { name: "Root input" })
  await expect(root).toBeVisible()
  await expect(page.getByRole("form", { name: "Connect account" })).toBeHidden()
  await expect(root.getByRole("button", { name: "Submit" })).toBeDisabled()
  await root.getByRole("button", { name: "Dismiss" }).click()
  await expect(question).toBeVisible()
  await allow.click()
  await expect(allow).toBeHidden()
  await question.click()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(question).toBeHidden()
  const details = page.getByRole("form", { name: "Export preferences" })
  await expect(details).toContainText("Subagent · older-grandchild")
  await details.getByRole("textbox", { name: "Name" }).fill("Report")
  await details.getByRole("spinbutton", { name: "Copies" }).fill("3")
  await expect(details.getByRole("textbox", { name: "Notes" })).toHaveValue("private")
  await details.getByText("Share", { exact: true }).last().click()
  await expect(details.getByRole("textbox", { name: "Notes" })).toBeHidden()
  await details.getByRole("button", { name: "Format" }).click()
  await page.getByRole("option", { name: "PDF" }).click()
  await details.getByText("Red", { exact: true }).click()
  await details.getByRole("button", { name: "Submit" }).click()
  await expect(page.getByText(/503/)).toBeVisible()
  await expect(details.getByRole("textbox", { name: "Name" })).toHaveValue("Report")
  await details.getByRole("textbox", { name: "Name" }).press("Control+Enter")
  const external = page.getByRole("form", { name: "Connect account" })
  await expect(external).toContainText("Directory-wide request · /fixture")
  await expect(external.getByRole("link")).toHaveAttribute("href", "https://example.org/connect?token=(demo)")
  await external.getByRole("button", { name: "Submit" }).click()
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable()
  expect(replies).toEqual([
    { path: "/api/session/root/form/root-input", body: null },
    { path: "/api/session/older-child/permission/permission/reply", body: { decision: "once" } },
    { path: "/api/session/older-grandchild/form/question/reply", body: { answer: { layout: "compact" } } },
    {
      path: "/api/session/older-grandchild/form/details/reply",
      body: {
        answer: {
          name: "Report",
          count: 3,
          scale: 0.5,
          share: false,
          format: "pdf",
          colors: ["red"],
        },
      },
    },
    { path: "/api/session/global/form/external/reply", body: { answer: { elicitation: true } } },
  ])
  expect(globalDirectories).toEqual([encodeURIComponent("/fixture")])
  expect(reads.toSorted()).toEqual(["older-child", "older-grandchild"])
  expect(pages).toEqual([null])
  expect(errors).toEqual([])
})
