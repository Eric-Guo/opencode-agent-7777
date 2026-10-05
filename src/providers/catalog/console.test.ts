import { expect, test } from "bun:test"
import { consoleProviderGroup, consoleProviderName } from "./console"

test("groups only providers managed by the identified Console workspace, preserving catalog order and names", () => {
  const providers = [
    { id: "openai", integrationID: "openai", name: "Example / OpenAI" },
    { id: "console-google", integrationID: "opencode", name: "Example / Google" },
    { id: "opencode", integrationID: "opencode", name: "Example / OpenCode" },
    { id: "console-openai", integrationID: "opencode", name: "Example / OpenAI" },
    { id: "other-workspace", integrationID: "opencode", name: "Elsewhere / OpenAI" },
    { id: "custom", name: "Example / Custom" },
  ]
  const original = structuredClone(providers)
  const group = consoleProviderGroup(providers)
  expect(group?.workspace).toBe("Example")
  expect(group?.providers.map((provider) => provider.id)).toEqual(["console-google", "opencode", "console-openai"])
  expect(consoleProviderName(group!, "Example / OpenAI")).toBe("OpenAI")
  expect(consoleProviderName(group!, "Elsewhere / OpenAI")).toBe("Elsewhere / OpenAI")
  expect(providers).toEqual(original)
})

test("keeps direct, unrecognized, and incomplete provider catalogs ungrouped", () => {
  for (const root of [
    undefined,
    { id: "opencode", name: "Example / OpenCode" },
    { id: "opencode", integrationID: "custom", name: "Example / OpenCode" },
    { id: "opencode", integrationID: "opencode", name: "OpenCode" },
    { id: "opencode", integrationID: "opencode", name: " / OpenCode" },
  ]) {
    expect(
      consoleProviderGroup([
        ...(root ? [root] : []),
        { id: "console-openai", integrationID: "opencode", name: "Example / OpenAI" },
      ]),
    ).toBeUndefined()
  }
})
