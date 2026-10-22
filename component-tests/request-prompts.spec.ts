import { expect, story } from "./fixture"

story(
  "preserves single, multiple and custom answers when navigating and omits unanswered fields",
  async ({ mount }) => {
    const component = await mount("question")
    await component.getByRole("radio", { name: "Compact" }).click()
    await component.getByRole("button", { name: "Next", exact: true }).click()
    await component.getByRole("checkbox", { name: "Tests", exact: true }).click()
    await component.getByRole("checkbox", { name: "Types", exact: true }).click()
    await component.getByRole("checkbox", { name: "Type your own answer" }).click()
    const custom = component.getByRole("textbox")
    await custom.fill("  lint  ")
    await custom.press("Enter")
    await component.getByRole("button", { name: "Back", exact: true }).click()
    await expect(component.getByRole("radio", { name: "Compact" })).toBeChecked()
    await component.getByRole("radio", { name: "Wide", exact: true }).click()
    await component.getByRole("button", { name: "Next", exact: true }).click()
    await expect(component.getByRole("checkbox", { name: "Tests", exact: true })).toBeChecked()
    await component.getByRole("checkbox", { name: "Type your own answer" }).click()
    await custom.fill("format")
    await custom.press("Enter")
    await component.getByRole("checkbox", { name: "Types", exact: true }).click()
    await component.getByRole("button", { name: "Next", exact: true }).click()
    await component.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(component.getByLabel("Answer", { exact: true })).toHaveText(
      '{"layout":"wide","checks":["tests","format"]}',
    )
    await component.getByRole("button", { name: "New request" }).click()
    await expect(component.getByRole("radio", { name: "Wide", exact: true })).not.toBeChecked()
    await expect(component.getByLabel("Answer", { exact: true })).toBeEmpty()
  },
)

story("keeps keyboard navigation, custom-answer escape and pending controls", async ({ mount }) => {
  const component = await mount("question")
  const compact = component.getByRole("radio", { name: "Compact" })
  const wide = component.getByRole("radio", { name: "Wide", exact: true })
  const own = component.getByRole("radio", { name: "Type your own answer" })
  await compact.focus()
  await compact.press("ArrowDown")
  await expect(wide).toBeFocused()
  await wide.press("End")
  await expect(own).toBeFocused()
  await own.press("Home")
  await expect(compact).toBeFocused()
  await compact.press("End")
  await own.press("Enter")
  const custom = component.getByRole("textbox")
  await custom.fill("Custom layout")
  await custom.press("Escape")
  await expect(component.getByLabel("Dismissed")).toHaveText("0")
  await expect(own).toBeFocused()
  await own.press("ControlOrMeta+Enter")
  await expect(component.getByText("2 of 3 questions", { exact: true })).toBeVisible()
  await component.getByRole("button", { name: "Questions 1", exact: true }).click()
  await expect(own).toBeChecked()
  await component.getByLabel("Responding", { exact: true }).check()
  await expect(compact).toBeDisabled()
  await expect(own).toBeDisabled()
  await expect(component.getByRole("button", { name: "Next", exact: true })).toBeDisabled()
  await expect(component.getByRole("button", { name: "Dismiss", exact: true })).toBeDisabled()
  await expect(component.getByRole("button", { name: "Questions 2", exact: true })).toBeDisabled()
  await component.getByLabel("Responding", { exact: true }).uncheck()
  await own.press("Escape")
  await expect(component.getByLabel("Dismissed")).toHaveText("1")
})

story("deduplicates custom multiselect answers and retains multiline free text", async ({ mount }) => {
  const component = await mount("question")
  await component.getByRole("button", { name: "Questions 2", exact: true }).click()
  await component.getByRole("checkbox", { name: "Tests", exact: true }).click()
  await component.getByRole("checkbox", { name: "Type your own answer" }).click()
  await component.getByRole("textbox").fill("tests")
  await component.getByRole("textbox").press("ControlOrMeta+Enter")
  await component.getByRole("radio", { name: "Type your own answer" }).click()
  await component.getByRole("textbox").fill("first\nsecond")
  await component.getByRole("textbox").press("ControlOrMeta+Enter")
  await expect(component.getByLabel("Answer", { exact: true })).toHaveText(
    '{"checks":["tests"],"notes":"first\\nsecond"}',
  )
})

story("keeps permission decisions, optional details and pending controls", async ({ mount }) => {
  const component = await mount("permission")
  await expect(component.getByText("Permission required", { exact: true })).toBeVisible()
  await expect(component.getByText("Allow this command to run?", { exact: true })).toBeVisible()
  await expect(component.getByText("packages/*", { exact: true })).toBeVisible()

  for (const [label, decision] of [
    ["Allow once", "once"],
    ["Allow always", "always"],
    ["Deny", "reject"],
  ]) {
    await component.getByRole("button", { name: label, exact: true }).click()
    await expect(component.getByLabel("Decision", { exact: true })).toHaveText(decision)
  }

  await component.getByLabel("Responding", { exact: true }).check()

  for (const label of ["Allow once", "Allow always", "Deny"]) {
    await expect(component.getByRole("button", { name: label, exact: true })).toBeDisabled()
  }

  await component.getByLabel("Details", { exact: true }).uncheck()
  await expect(component.locator('[data-slot="permission-hint"]')).toHaveCount(0)
  await expect(component.locator('[data-slot="permission-patterns"]')).toHaveCount(0)
})
