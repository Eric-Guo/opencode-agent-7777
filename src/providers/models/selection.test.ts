import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { isServer } from "solid-js/web"
import type { SessionInfo } from "@opencode/client/promise"
import { setState, state } from "@/runtime/server/session-store-compact"
import type { ModelOption } from "./models"
import { createModelSelection, reconcileModelSelection, resolveSelectedModel } from "./selection"

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

describe("recent model cycling", () => {
  const providerID = "cycle-test"
  const key = (modelID: string) => ({ providerID, modelID })
  beforeEach(() => {
    setState({
      session: undefined,
      models: ["one", "two", "three", "outside"].map((id) => ({ ...key(id), variants: {} })) as ModelOption[],
      selectedModel: undefined,
    })
  })
  afterEach(() => setState({ models: [], selectedModel: undefined }))

  test("wraps in both directions without changing recency order", () => {
    const selection = createModelSelection()
    for (const id of ["one", "two", "three"]) selection.set(key(id), { recent: true })
    const recent = () => selection.recent().map((item) => item.modelID)
    expect(recent()).toEqual(["three", "two", "one"])
    for (const id of ["two", "one", "three"]) {
      selection.cycle(1)
      expect(selection.current()).toMatchObject(key(id))
    }
    selection.cycle(-1)
    expect(selection.current()).toMatchObject(key("one"))
    expect(recent()).toEqual(["three", "two", "one"])

    selection.set(key("outside"))
    selection.cycle(1)
    expect(selection.current()).toMatchObject(key("three"))
    selection.set(key("outside"))
    selection.cycle(-1)
    expect(selection.current()).toMatchObject(key("one"))
  })

  test("skips hidden and missing recent models without making them visible", () => {
    // Bun defaults to Solid's SSR build, whose memos do not react to visibility changes.
    if (isServer) {
      const result = Bun.spawnSync([
        process.execPath,
        "--conditions=browser",
        "test",
        import.meta.path,
        "--test-name-pattern",
        "skips hidden and missing",
      ])
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      return
    }
    const selection = createModelSelection()
    for (const id of ["one", "two", "three"]) selection.set(key(id), { recent: true })
    selection.setVisibility(key("two"), false)
    setState("models", (items) => items.filter((item) => item.modelID !== "one"))
    selection.set(key("outside"))
    expect(selection.recent().map((item) => item.modelID)).toEqual(["three"])
    selection.cycle(1)
    expect(selection.current()).toMatchObject(key("three"))
    expect(selection.visible(key("two"))).toBe(false)

    selection.setProviderVisibility(providerID, false)
    selection.cycle(-1)
    expect(selection.current()).toMatchObject(key("three"))
    expect(selection.recent()).toEqual([])
  })
})

describe("session model selection", () => {
  const model = { providerID: "session-variant-test", modelID: "reasoning" }
  const other = { providerID: "session-variant-test", modelID: "other" }
  const session = (id: string, variant?: string): SessionInfo => ({
    id,
    agent: "7777",
    projectID: "project",
    location: { directory: "/repo" },
    model: { providerID: model.providerID, id: model.modelID, ...(variant ? { variant } : {}) },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  })
  beforeEach(() => {
    setState({
      server: undefined,
      session: undefined,
      models: [
        { ...model, variants: { low: {}, high: {} } },
        { ...other, variants: { low: {}, high: {} } },
      ] as unknown as ModelOption[],
      selectedModel: { ...model },
      agentModels: { "7777": { ...model, variant: "high" } },
    })
  })
  afterEach(() =>
    setState({ models: [], selectedModel: undefined, session: undefined, server: undefined, agentModels: {} }),
  )

  test("uses the configured variant before a preference exists and preserves explicit Default", () => {
    const selection = createModelSelection()
    expect(selection.variant.current()).toBe("high")
    selection.variant.set(undefined)
    expect(selection.variant.current()).toBeUndefined()
    selection.variant.set("low")
    expect(selection.variant.current()).toBe("low")
    selection.set(other)
    expect(selection.variant.current()).toBeUndefined()
  })

  test("restores independent choices across sessions, including an explicit Default", () => {
    const selection = createModelSelection()
    setState("session", session("choice-a", "high"))
    selection.variant.set(undefined)
    setState("session", session("choice-b", "high"))
    expect(selection.variant.current()).toBe("high")
    selection.set(other)
    selection.variant.set("low")
    setState("session", session("choice-a", "high"))
    expect(selection.current()).toMatchObject(model)
    expect(selection.variant.current()).toBeUndefined()
    setState("session", session("choice-b", "high"))
    expect(selection.current()).toMatchObject(other)
    expect(selection.variant.current()).toBe("low")
    selection.variant.set("unavailable")
    expect(selection.variant.current()).toBe("low")
  })

  test("cycling pins the model and Default variant to the active session", () => {
    const selection = createModelSelection()
    setState("session", session("cycle-session-a", "high"))
    selection.set(other, { recent: true })
    selection.variant.set("low")
    selection.set(model, { recent: true })
    selection.variant.set("high")
    selection.variant.cycle()
    expect(selection.variant.current()).toBeUndefined()
    selection.cycle(1)
    expect(selection.current()).toMatchObject(other)
    expect(selection.variant.current()).toBe("low")
    selection.cycle(-1)
    expect(selection.current()).toMatchObject(model)
    expect(selection.variant.current()).toBeUndefined()

    setState("session", session("cycle-session-b", "high"))
    expect(selection.variant.current()).toBe("high")
    setState("session", session("cycle-session-a", "high"))
    expect(selection.variant.current()).toBeUndefined()
    selection.variant.cycle()
    expect(selection.variant.current()).toBe("low")
  })

  test("scopes unsent choices to the server, directory, and desktop agent", () => {
    const selection = createModelSelection()
    setState("session", session("scoped", "high"))
    selection.variant.set("low")
    setState("server", { url: "https://other.example", localAgent: "7777", welcomeText: "", suggestedQuestions: [] })
    expect(selection.variant.current()).toBe("high")
    setState("server", undefined)
    setState("session", "location", { directory: "/other" })
    expect(selection.variant.current()).toBe("high")
    setState("session", session("scoped", "high"))
    expect(selection.variant.current()).toBe("low")
    setState("session", "agent", "other-agent")
    expect(selection.variant.current()).toBe("high")
  })

  test("uses the durable model and explicit Default ahead of global preferences", () => {
    const selection = createModelSelection()
    selection.variant.set("high")
    setState("session", session("durable"))
    setState("selectedModel", { ...other })
    expect(selection.current()).toMatchObject(model)
    expect(selection.variant.current()).toBeUndefined()
    setState("session", "model", { providerID: model.providerID, id: "missing", variant: "high" })
    expect(selection.current()).toMatchObject(other)
  })

  test("ignores a session's model when a desktop tab targets a different agent", () => {
    setState("server", {
      url: "https://agent.example",
      localAgent: "desktop-agent",
      welcomeText: "",
      suggestedQuestions: [],
    })
    setState("session", session("desktop", "high"))
    setState("selectedModel", { ...other })
    const selection = createModelSelection()
    expect(selection.current()).toMatchObject(other)
  })

  test("retires an acknowledged choice so later server selections can take effect", () => {
    const selection = createModelSelection()
    setState("session", session("acknowledged", "high"))
    selection.variant.set("low")
    selection.trackSessionCommit({ model, variant: "low" })
    setState("session", "model", { providerID: model.providerID, id: model.modelID, variant: "low" })
    reconcileModelSelection()
    setState("session", "model", { providerID: model.providerID, id: model.modelID, variant: "high" })
    expect(selection.variant.current()).toBe("high")
  })

  test("keeps newer choices and submission snapshots intact when an older acknowledgement arrives", () => {
    const selection = createModelSelection()
    setState("session", session("late-ack", "high"))
    selection.variant.set("low")
    const snapshot = { model: { ...model }, variant: "low" }
    selection.trackSessionCommit(snapshot)
    selection.variant.set(undefined)
    setState("session", "model", { providerID: model.providerID, id: model.modelID, variant: "low" })
    reconcileModelSelection()
    expect(selection.variant.current()).toBeUndefined()
    expect(snapshot).toEqual({ model: { providerID: "session-variant-test", modelID: "reasoning" }, variant: "low" })
    expect(state.session?.model?.variant).toBe("low")
  })

  test("waits for both agent and model acknowledgements", () => {
    const selection = createModelSelection()
    setState("server", { url: "https://ack.example", localAgent: "7777", welcomeText: "", suggestedQuestions: [] })
    setState("session", { ...session("agent-ack"), agent: "old-agent" })
    selection.set(model)
    selection.variant.set("low")
    selection.trackSessionCommit({ model, variant: "low" })
    setState("session", "model", { providerID: model.providerID, id: model.modelID, variant: "low" })
    reconcileModelSelection()
    selection.variant.set("high")
    setState("session", "agent", "7777")
    reconcileModelSelection()
    expect(selection.variant.current()).toBe("high")
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
