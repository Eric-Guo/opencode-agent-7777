import { expect, test } from "@playwright/test"
import { mockEvents } from "./session.fixture"

test("shell and edit expansion follow independent saved defaults and allow manual disclosure", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const tasks = [
    { task_key: "shell", name: "tool_call", tool: "bash", status: "completed", output: "Suite passed" },
    { task_key: "edit", name: "tool_call", tool: "edit", status: "completed", output: "Updated notes.txt" },
  ]

  await mockEvents(page)
  await page.route("**/api/7777/**", (route) => {
    const { pathname, searchParams } = new URL(route.request().url())
    const json = (body: unknown) => route.fulfill({ json: body })
    if (pathname.endsWith("/connection"))
      return json({ scope: "fixture", user: "Human", agent: "OpenCode", workspace: "Shared", model: "m", runner: "r" })
    if (pathname.endsWith("/choices")) return json({ models: [], runners: [], approvals: ["ask"] })
    if (pathname.endsWith("/rounds"))
      return json({ rounds: [{ task_key: "r1", status: "completed", calls: { items: tasks } }], has_older: false })
    if (pathname.endsWith("/task")) return json(tasks.find((task) => task.task_key === searchParams.get("key")))
    if (!pathname.endsWith("/chats/chat")) return json([])
    return json({
      turns: [
        {
          id: "turn",
          input: "input",
          variant: "variant",
          run: "run",
          created: 1,
          position: 1,
          prompt: "Run the check and edit the notes",
          text: "Check and edit complete",
          status: "completed",
        },
      ],
      pending: [],
      busy: false,
      decisions: [],
      detail: { title: "Tool calls", writable: true },
    })
  })

  await page.goto("/component-tests/nexus-chat.html#/workspaces/shared/conversations/chat")
  const activity = page.getByText("Tools and activity", { exact: true })
  const settings = page.getByRole("button", { name: "Conversation preferences" })
  const shellSetting = page.getByRole("menuitemcheckbox", { name: "Expand shell tool parts" })
  const editSetting = page.getByRole("menuitemcheckbox", { name: "Expand edit tool parts" })
  const shellOutput = page.getByText("Suite passed", { exact: true })
  const editOutput = page.getByText("Updated notes.txt", { exact: true })
  const editTask = page.getByText("edit · completed", { exact: true })

  await activity.click()
  await expect(editTask).toBeVisible()
  await settings.click()
  await expect(shellSetting).not.toBeChecked()
  await expect(editSetting).not.toBeChecked()
  await expect(shellOutput).toBeHidden()
  await expect(editOutput).toBeHidden()
  await shellSetting.click()
  await expect(shellOutput).toBeVisible()
  await expect(editOutput).toBeHidden()

  await settings.click()
  await editSetting.click()
  await expect(editOutput).toBeVisible()
  await editTask.click()
  await expect(editOutput).toBeHidden()
  await expect(shellOutput).toBeVisible()

  await page.reload()
  await activity.click()
  await expect(editOutput).toBeVisible()
  await expect(shellOutput).toBeVisible()
  await settings.click()
  await expect(shellSetting).toBeChecked()
  await expect(editSetting).toBeChecked()
  await shellSetting.click()
  await expect(shellOutput).toBeHidden()
  await expect(editOutput).toBeVisible()
  expect(errors).toEqual([])
})
