import { describe, expect, test } from "bun:test"
import { resolveSelectedModel } from "./selection"

const first = Object.freeze({ providerID: "provider-a", modelID: "first" })
const configured = Object.freeze({ providerID: "provider-a", modelID: "configured" })
const server = Object.freeze({ providerID: "provider-b", modelID: "server" })
const stored = Object.freeze({ providerID: "provider-b", modelID: "stored" })
const missing = Object.freeze({ providerID: "missing", modelID: "stored" })
const models = [first, configured, server, stored]
const defaults = { "provider-b": "server" }

describe("model selection fallback", () => {
  test("prefers the saved selection, then source defaults, then server defaults", () => {
    expect(resolveSelectedModel(models, defaults, stored, configured)).toEqual({
      providerID: "provider-b",
      modelID: "stored",
    })
    expect(resolveSelectedModel(models, defaults, missing, configured)).toEqual({
      providerID: "provider-a",
      modelID: "configured",
    })
    expect(resolveSelectedModel(models, defaults, missing, missing)).toEqual({
      providerID: "provider-b",
      modelID: "server",
    })
    expect(resolveSelectedModel(models, {}, missing, missing)).toEqual({ providerID: "provider-a", modelID: "first" })
    expect(resolveSelectedModel([], defaults, stored, configured)).toBeUndefined()
  })

  test("matches both provider and model IDs", () => {
    expect(resolveSelectedModel([first], {}, { providerID: "other", modelID: "first" }, undefined)).toEqual({
      providerID: "provider-a",
      modelID: "first",
    })
  })

  test("returns an isolated selection for the mutable session store", () => {
    const selected = resolveSelectedModel(models, defaults, stored, configured)!
    selected.modelID = "changed"
    expect(stored).toEqual({ providerID: "provider-b", modelID: "stored" })
    expect(models[3]).toEqual({ providerID: "provider-b", modelID: "stored" })
  })
})
