import { describe, expect, test } from "bun:test"
import type { SessionPromptInput } from "@opencode/client/promise"
import { createPromptAdmission } from "./retry"

const server = "http://localhost:4096"
const payload = {
  sessionID: "ses_original",
  text: "see @note",
  files: [{ uri: "data:text/plain;base64,YQ==", name: "note.txt" }],
  agents: [{ name: "note", mention: { text: "@note", start: 4, end: 9 } }],
  delivery: "queue",
  metadata: { agent: "7777", model: { providerID: "provider", modelID: "model", variant: "high" } },
} satisfies SessionPromptInput

describe("prompt admission identity", () => {
  const first = createPromptAdmission(server, payload)
  const saved = first.retry()
  test("reuses the ID for the exact outgoing payload and server", () => {
    expect(createPromptAdmission(server, structuredClone(payload), saved).input.id).toBe(first.input.id)
    expect(createPromptAdmission("http://localhost:4097", payload, saved).replay).toBe(false)
    expect(createPromptAdmission(server, payload).input.id).not.toBe(first.input.id)
  })

  test("retires an ID that the server explicitly identifies as conflicting", () => {
    const error = { _tag: "ConflictError", message: "Conflicting prompt ID", resource: first.input.id }
    expect(first.retry(error)).toBeUndefined()
    expect(first.retry({ ...error, resource: "another" })).toEqual(saved)
  })

  test("a model from a cold catalog is only restored for the matching retry", () => {
    const cold = { ...payload, metadata: { agent: payload.metadata.agent } }
    expect(createPromptAdmission(server, cold, saved, true).input).toEqual(first.input)
    const next = createPromptAdmission(server, { ...cold, text: "new" }, saved, true)
    expect(next.input.metadata).toEqual(cold.metadata)
    expect(next.replay).toBe(false)
    expect(createPromptAdmission(server, cold, saved).replay).toBe(false)
  })

  test.each<[string, Partial<Parameters<typeof createPromptAdmission>[1]>]>([
    ["session", { sessionID: "ses_other" }],
    ["text", { text: "new prompt" }],
    ["delivery", { delivery: "steer" }],
    ["inline bytes", { files: [{ ...payload.files[0], uri: "data:text/plain;base64,Yg==" }] }],
    ["filename", { files: [{ ...payload.files[0], name: "other.txt" }] }],
    ["file mention", { files: [{ uri: "file:///notes", mention: payload.agents[0].mention }] }],
    ["mention offsets", { agents: [{ ...payload.agents[0], mention: { text: "@note", start: 5, end: 10 } }] }],
    ["skill", { skills: [{ id: "other" }] }],
    ["agent", { metadata: { ...payload.metadata, agent: "other" } }],
    ["model", { metadata: { ...payload.metadata, model: { ...payload.metadata.model, modelID: "new" } } }],
    ["variant", { metadata: { ...payload.metadata, model: { ...payload.metadata.model, variant: "low" } } }],
  ])("uses a new ID after changing %s", (_, change) => {
    const next = createPromptAdmission(server, { ...payload, ...change }, saved)
    expect(next.replay).toBe(false)
    expect(next.input.id).not.toBe(first.input.id)
  })
})
