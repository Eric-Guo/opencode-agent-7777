import { afterEach, describe, expect, test } from "bun:test"
import { setState } from "@/runtime/server/session-store-compact"
import type { ModelOption } from "./models"
import { createModelSelection, resolveSelectedModel } from "./selection"

const first = Object.freeze({ providerID: "provider-a", modelID: "first" })
const configured = Object.freeze({ providerID: "provider-a", modelID: "configured" })
const server = Object.freeze({ providerID: "provider-b", modelID: "server" })
const stored = Object.freeze({ providerID: "provider-b", modelID: "stored" })
const missing = Object.freeze({ providerID: "missing", modelID: "stored" })
const models = [first, configured, server, stored]
const defaults = { "provider-b": "server" }

describe("active model variant", () => {
  afterEach(() => setState({ models: [], selectedModel: undefined }))

  test("follows the selected catalog model and rejects variants removed by a catalog refresh", () => {
    const options = [
      { providerID: "variant-test", modelID: "first", variants: { low: {}, high: {} } },
      { providerID: "variant-test", modelID: "second", variants: { medium: {} } },
      { providerID: "variant-test", modelID: "plain", variants: {} },
    ] as ModelOption[]
    const original = structuredClone(options)
    setState("models", options)
    const selection = createModelSelection()
    selection.set({ providerID: "variant-test", modelID: "first" })
    selection.variant.set("high")
    expect(selection.variant.list()).toEqual(["low", "high"])
    expect(selection.variant.current()).toBe("high")

    selection.set({ providerID: "variant-test", modelID: "second" })
    expect(selection.variant.current()).toBeUndefined()
    selection.variant.set("medium")
    selection.set({ providerID: "variant-test", modelID: "first" })
    expect(selection.variant.current()).toBe("high")

    setState("models", [{ ...original[0], variants: { low: {} } }, ...original.slice(1)])
    expect(selection.variant.current()).toBeUndefined()
    expect(options).toEqual(original)
    selection.variant.set("low")
    expect(selection.variant.current()).toBe("low")
    selection.variant.set(undefined)
    expect(selection.variant.current()).toBeUndefined()

    selection.set({ providerID: "variant-test", modelID: "plain" })
    expect(selection.variant.list()).toEqual([])
    selection.variant.set("high")
    expect(selection.variant.current()).toBeUndefined()
  })
})

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

  test("upgrades unambiguous API IDs while preferring exact catalog IDs", () => {
    const options = [
      { providerID: "provider", modelID: "configured", api: { id: "legacy" } },
      { providerID: "other", modelID: "other", api: { id: "legacy" } },
    ]
    expect(resolveSelectedModel(options, {}, { providerID: "provider", modelID: "legacy" }, undefined)).toEqual({
      providerID: "provider",
      modelID: "configured",
    })
    const exact = { providerID: "provider", modelID: "legacy", api: { id: "different" } }
    expect(resolveSelectedModel([...options, exact], {}, exact, undefined)).toEqual({
      providerID: "provider",
      modelID: "legacy",
    })
  })

  test("falls back to the server default when a saved API ID matches multiple configured models", () => {
    const options = [
      { providerID: "provider", modelID: "first", api: { id: "legacy" } },
      { providerID: "provider", modelID: "second", api: { id: "legacy" } },
    ]
    expect(
      resolveSelectedModel(options, { provider: "second" }, { providerID: "provider", modelID: "legacy" }, undefined),
    ).toEqual({ providerID: "provider", modelID: "second" })
  })
})
