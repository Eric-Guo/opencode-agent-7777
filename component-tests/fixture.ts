import { expect, test } from "@playwright/test"
import type { Locator } from "@playwright/test"

export { expect }

export const story = test.extend<{
  mount: (prompt: "question" | "permission") => Promise<Locator>
}>({
  mount: async ({ page }, use) => {
    await use(async (prompt) => {
      await page.goto(`/component-tests/index.html?prompt=${prompt}`)
      const root = page.locator("#oc-agent")
      await expect(root.locator(`[data-component="dock-prompt"][data-kind="${prompt}"]`)).toBeVisible()

      return root
    })
  },
})
