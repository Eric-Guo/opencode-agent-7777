import { describe, expect, test } from "bun:test"
import { getConfiguredAgentVariant, resolveModelVariant } from "./variant"

describe("configured agent variant", () => {
  const model = { providerID: "provider", modelID: "reasoning", variants: { high: {} } }
  const agent = { model: { providerID: "provider", modelID: "reasoning" }, variant: "high" }

  test("only applies to the agent's configured provider and model", () => {
    expect(getConfiguredAgentVariant({ agent, model })).toBe("high")
    expect(getConfiguredAgentVariant({ agent, model: { ...model, providerID: "other" } })).toBeUndefined()
    expect(getConfiguredAgentVariant({ agent, model: { ...model, modelID: "other" } })).toBeUndefined()
    expect(getConfiguredAgentVariant({ agent: { variant: "high" }, model })).toBeUndefined()
    expect(getConfiguredAgentVariant({ agent, model: { ...model, variants: undefined } })).toBeUndefined()
    expect(getConfiguredAgentVariant({ agent: undefined, model })).toBeUndefined()
  })
})

describe("model variant", () => {
  const input = { variants: ["low", "high"], selected: undefined, configured: "high" }

  test("resolves selected, preferred, then configured variants", () => {
    expect(resolveModelVariant(input)).toBe("high")
    expect(resolveModelVariant({ ...input, preferred: "low" })).toBe("low")
    expect(resolveModelVariant({ ...input, preferred: "low", selected: "high" })).toBe("high")
  })

  test("keeps an explicit Default instead of reapplying a configured variant", () => {
    expect(resolveModelVariant({ ...input, selected: null })).toBeUndefined()
    expect(resolveModelVariant({ ...input, preferred: "default" })).toBeUndefined()
  })

  test("rejects stale variants without substituting a different reasoning level", () => {
    expect(resolveModelVariant({ ...input, selected: "removed" })).toBeUndefined()
    expect(resolveModelVariant({ ...input, preferred: "removed" })).toBeUndefined()
    expect(resolveModelVariant({ ...input, variants: [] })).toBeUndefined()
  })
})
