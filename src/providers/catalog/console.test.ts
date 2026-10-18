import { expect, test } from "bun:test"
import { consoleProviderGroup, consoleProviderLabels, consoleProviderName } from "./console"

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

test.each([
  { directID: "openai", managedID: "console-openai" },
  { directID: "direct-account", managedID: "managed-account", canonical: "openai" },
])("disambiguates Console labels using the full catalog: %j", ({ directID, managedID, canonical }) => {
  const providers = [
    { id: "opencode", integrationID: "opencode", name: "Example / OpenCode" },
    { id: directID, canonical, name: "Direct OpenAI" },
    { id: managedID, canonical, integrationID: "opencode", name: "Example / OpenAI" },
    { id: "console-google", integrationID: "opencode", name: "Example / Google" },
    { id: "custom", name: "Example / Custom" },
    { id: "other-workspace", canonical, integrationID: "opencode", name: "Elsewhere / OpenAI" },
  ]
  const original = structuredClone(providers)
  const label = consoleProviderLabels(providers)
  // The displayed result can omit both the root and direct provider after filtering.
  expect([providers[2]].map(label)).toEqual([{ name: "OpenAI", workspace: "Example" }])
  expect(label(providers[1])).toEqual({ name: "Direct OpenAI" })
  expect(label(providers[3])).toEqual({ name: "Google" })
  expect(label(providers[4])).toEqual({ name: "Example / Custom" })
  expect(label(providers[5])).toEqual({ name: "Elsewhere / OpenAI" })
  expect(providers).toEqual(original)

  const managedOnly = consoleProviderLabels([providers[0], providers[2]])
  expect(managedOnly(providers[2])).toEqual({ name: "OpenAI" })
  const missingRoot = consoleProviderLabels([providers[1], providers[2]])
  expect(missingRoot(providers[2])).toEqual({ name: "Example / OpenAI" })
})
