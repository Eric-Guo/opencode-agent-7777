import { expect, test } from "@playwright/test"

test("browses and previews workspace files without persisting a new session", async ({ page }) => {
  const requests: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${request.url()}`)
  })
  await page.route("**/api/fs/list?*", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("location[directory]")).toBe("/workspace/agent-plm-meeting")
    await route.fulfill({
      json: {
        location: { directory: "/workspace/agent-plm-meeting" },
        data: [{ path: "minutes.md", type: "file" }],
      },
    })
  })
  await page.route("**/api/fs/read/**", (route) => route.fulfill({ body: "Meeting notes from the workspace" }))
  await page.goto("/component-tests/session-files.html")

  const panel = page.locator('[data-slot="session-file-tree"]')
  await expect(panel.getByText("agent-plm-meeting", { exact: true })).toBeVisible()
  await panel.getByText("minutes.md", { exact: true }).click()
  await expect(page.getByRole("tab", { name: "minutes.md" })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByText("Meeting notes from the workspace", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "New draft", exact: true }).click()
  await expect(panel.getByText("minutes.md", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Session ID")).toHaveText("No session")
  expect(requests.some((request) => request.startsWith("GET ") && request.includes("/api/fs/list?"))).toBe(true)
  expect(requests.filter((request) => request.startsWith("POST "))).toEqual([])
})
