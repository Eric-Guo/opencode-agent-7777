import { expect, test } from "bun:test"
import { APIError } from "@cybros/agent"
import { modelFields, openReply, sealReply, submitReply } from "./reply"

const chat = {
  public_id: "chat",
  default_runner: { executor_public_id: "remote", display_name: null, presence: "online", last_seen_at: null },
}
const submission = { key: "input", model: "model", text: "what time is it now?" }
test("a prepared reply retains its directory and is bound to the original identity and request", () => {
  const first = { executor_contexts: { remote: { "opencode.directory": "/first" } } }
  const ticket = sealReply("member", "scope", chat, submission, first)
  const restored = openReply("member", "scope", chat, submission, ticket)
  expect(restored).toMatchObject({
    kind: "direct_reply",
    text: "what time is it now?",
    model: { model: "model" },
    approval_mode: "ask",
    executor_contexts: { remote: { "opencode.directory": "/first" } },
  })
  expect(() => openReply("member", "other", chat, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", { ...chat, public_id: "other" }, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", chat, { ...submission, key: "other" }, ticket)).toThrow()
  expect(() => openReply("member", "scope", { ...chat, default_runner: null }, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", chat, submission, "forged")).toThrow()
})

test("a stricter approval policy is respected on creation and receipt replay", async () => {
  for (const [status, code, message] of [
    [422, "validation_failed", "Approval mode only tightens the declaring profile's approval mode"],
    [409, "idempotency_envelope_mismatch", "Mismatch"],
  ] as const) {
    const modes: unknown[] = []
    const receipt = await submitReply({ kind: "direct_reply", text: "hello", approval_mode: "ask" }, async (input) => {
      modes.push(input.approval_mode)
      if (input.approval_mode === "ask") throw new APIError(message, status, code, null, null, null)
      return "receipt"
    })
    expect(receipt).toBe("receipt")
    expect(modes).toEqual(["ask", "rules"])
  }
})

test("a prepared Human reply cannot change delivery, target, model intent or approval on retry", () => {
  const input = {
    ...submission,
    model: null,
    delivery: "steer_now" as const,
    target: "active-run",
    approval: "rules" as const,
  }
  const ticket = sealReply("member", "scope", chat, input, modelFields(null, "default-at-prepare", ["fallback"]))
  const envelope = openReply("member", "scope", chat, input, ticket)
  expect(envelope.model).toEqual({ model: "default-at-prepare" })
  expect(envelope.model_selection).toMatchObject({ source: "default", model: "default-at-prepare", constraint: "any" })
  expect(envelope.fallback_models).toEqual(["fallback"])
  expect(envelope).toMatchObject({
    delivery_mode: "steer_now",
    expected_steering_run_public_id: "active-run",
    approval_mode: "rules",
  })
  for (const change of [
    { delivery: "queue" as const },
    { target: "new-run" },
    { model: "pinned" },
    { approval: "bypass" as const },
  ]) {
    expect(() => openReply("member", "scope", chat, { ...input, ...change }, ticket)).toThrow()
  }
})
