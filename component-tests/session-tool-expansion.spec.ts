import type { SessionMessageInfo } from "@opencode/client/promise"
import { expect, test } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

test("shell and edit expansion follow independent saved defaults and allow manual disclosure", async ({ page }) => {
  const shellReads: string[] = []
  page.on("request", (request) => {
    if (/\/api\/shell(?:[/?]|$)/.test(request.url())) shellReads.push(request.url())
  })
  const history: SessionMessageInfo[] = [
    { id: "user", type: "user", text: "Run the check and edit the notes", time: { created: 1 } },
    {
      id: "assistant",
      type: "assistant",
      agent: "7777",
      model: { id: "fixture", providerID: "fixture" },
      time: { created: 2, completed: 7 },
      content: [
        {
          type: "tool",
          id: "shell",
          name: "shell",
          time: { created: 3, completed: 4 },
          state: {
            status: "completed",
            input: { command: "bun test" },
            content: [{ type: "text", text: "Suite passed" }],
            metadata: { shellID: "sh_saved", status: "completed", exit: 0 },
          },
        },
        {
          type: "tool",
          id: "edit",
          name: "edit",
          time: { created: 5, completed: 6 },
          state: {
            status: "completed",
            input: { path: "notes.txt", oldString: "old", newString: "new" },
            content: [{ type: "text", text: "Updated notes.txt" }],
            metadata: {
              files: [
                {
                  file: "notes.txt",
                  status: "modified",
                  additions: 1,
                  deletions: 1,
                  patch: "--- a/notes.txt\n+++ b/notes.txt\n@@ -1 +1 @@\n-old\n+new\n",
                },
              ],
            },
          },
        },
      ],
    },
  ]
  const { errors } = await setupSession(page, undefined, history)
  const settings = page.getByRole("button", { name: "Follow-up behavior" })
  const shellSetting = page.getByRole("menuitemcheckbox", { name: "Expand shell tool parts" })
  const editSetting = page.getByRole("menuitemcheckbox", { name: "Expand edit tool parts" })
  const shellOutput = page.getByText("Suite passed", { exact: true })
  const editFile = page.getByRole("button", { name: /notes\.txt/ })

  await settings.click()
  await expect(shellSetting).not.toBeChecked()
  await expect(editSetting).not.toBeChecked()
  await expect(shellOutput).toBeHidden()
  await expect(editFile).toBeHidden()
  await shellSetting.click()
  await expect(shellOutput).toBeVisible()
  await expect(editFile).toBeHidden()

  await settings.click()
  await editSetting.click()
  await expect(editFile).toHaveAttribute("aria-expanded", "true")
  await editFile.click()
  await expect(editFile).toHaveAttribute("aria-expanded", "false")
  await expect(shellOutput).toBeVisible()

  await page.reload()
  await expect(editFile).toHaveAttribute("aria-expanded", "true")
  await expect(shellOutput).toBeVisible()
  await settings.click()
  await expect(shellSetting).toBeChecked()
  await expect(editSetting).toBeChecked()
  await shellSetting.click()
  await expect(shellOutput).toBeHidden()
  await expect(editFile).toHaveAttribute("aria-expanded", "true")
  expect(shellReads).toEqual([])
  expect(errors).toEqual([])
})
