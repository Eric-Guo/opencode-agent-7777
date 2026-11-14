import { expect, test } from "bun:test"
import { openReply, sealReply } from "./reply"

const chat = {
  public_id: "chat",
  default_runner: { executor_public_id: "remote", display_name: null, presence: "online", last_seen_at: null },
}
const submission = { key: "input", model: "model", text: "what time is it now?" }
test("a prepared reply is bound to the original identity, runner and request", () => {
  const ticket = sealReply("member", "scope", chat, submission)
  expect(() => openReply("member", "scope", chat, submission, ticket)).not.toThrow()
  expect(() => openReply("member", "other", chat, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", { ...chat, public_id: "other" }, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", chat, { ...submission, key: "other" }, ticket)).toThrow()
  expect(() => openReply("member", "scope", { ...chat, default_runner: null }, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", chat, submission, "forged")).toThrow()
})

test("a prepared Human reply cannot change delivery, target, model intent or approval on retry", () => {
  const input = {
    ...submission,
    model: null,
    delivery: "steer_now" as const,
    target: "active-run",
    approval: "rules" as const,
  }
  const ticket = sealReply("member", "scope", chat, input)
  expect(() => openReply("member", "scope", chat, input, ticket)).not.toThrow()
  for (const change of [
    { delivery: "queue" as const },
    { target: "new-run" },
    { model: "pinned" },
    { approval: "bypass" as const },
  ]) {
    expect(() => openReply("member", "scope", chat, { ...input, ...change }, ticket)).toThrow()
  }
})
