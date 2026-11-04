import { expect, test } from "bun:test"
import { APIError } from "@cybros/agent"
import { modelFields, openReply, replyContext as prepare, sealReply, submitReply } from "./reply"

const chat = {
  public_id: "chat",
  default_runner: { executor_public_id: "remote", display_name: null, presence: "online", last_seen_at: null },
}
const replyContext = (info: Parameters<typeof prepare>[0], get: Parameters<typeof prepare>[1]) =>
  prepare(info, get, async () => undefined)
const submission = { key: "input", model: "model", text: "what time is it now?" }
const missing = () => Response.json({ error: { code: "host_not_followed" } }, { status: 404 })
const listing = () =>
  Response.json({
    runners: [
      { public_id: "local", root: "/local" },
      { public_id: "remote", root: "/remote" },
    ],
  })

test("unfollowed conversations capture only their bound runner's announced default", async () => {
  const paths: string[] = []
  const context = await replyContext(chat, async (path) => {
    paths.push(path)
    return path === "/runners" ? listing() : missing()
  })
  expect(paths).toEqual(["/conversations/environment?public_id=chat", "/runners"])
  expect(context.executor_contexts).toEqual({
    remote: { "rho.environment": { root: "/remote", directories: [], anchor: "chat" } },
  })
  expect(context.inline?.[0]).toMatchObject({ role: "developer", position: "lead" })
  expect(context.inline?.[0].text).toContain("tool_search")
  expect(context.inline?.[0].text).toContain("tool_call")
})

test("each new send captures the current binding; retries restore the original input", async () => {
  let root = "/first"
  const get = async () =>
    Response.json({
      environment: { runner: "remote", conversation: "chat", root, directories: ["/extra"], anchor: "parent" },
    })
  const first = await replyContext(chat, get)
  const ticket = sealReply("member", "scope", chat, submission, first)
  root = "/next"
  const next = await replyContext(chat, get)
  expect(next.executor_contexts?.remote).toEqual({
    "rho.environment": { root: "/next", directories: ["/extra"], anchor: "parent" },
  })
  const restored = openReply("member", "scope", chat, submission, ticket)
  expect(restored).toMatchObject({
    kind: "direct_reply",
    text: "what time is it now?",
    model: { model: "model" },
    approval_mode: "ask",
    executor_contexts: { remote: { "rho.environment": { root: "/first", directories: ["/extra"], anchor: "parent" } } },
  })
  expect(() => openReply("member", "other", chat, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", { ...chat, public_id: "other" }, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", chat, { ...submission, key: "other" }, ticket)).toThrow()
  expect(() => openReply("member", "scope", { ...chat, default_runner: null }, submission, ticket)).toThrow()
  expect(() => openReply("member", "scope", chat, submission, "forged")).toThrow()
})

test("only an unbound runner default can fall back to discovery", async () => {
  const env = { conversation: "chat", runner: "remote", source: "default", root: null, directories: [], anchor: null }
  const context = await replyContext(chat, async (path) =>
    path === "/runners" ? listing() : Response.json({ environment: env }),
  )
  expect(context.executor_contexts?.remote).toEqual({
    "rho.environment": { root: "/remote", directories: [], anchor: "chat" },
  })
  for (const overrides of [
    { runner: "other" },
    { source: "conversation", root: null },
    { root: "relative" },
    { root: "/home", directories: ["relative"] },
  ]) {
    await expect(
      replyContext(chat, async () => Response.json({ environment: { ...env, ...overrides } })),
    ).rejects.toThrow()
  }
  await expect(
    replyContext(chat, async (path) =>
      path === "/runners" ? Response.json({ runners: [{ public_id: "local", root: "/local" }] }) : missing(),
    ),
  ).rejects.toThrow()
  await expect(replyContext(chat, async () => Response.json({}, { status: 403 }))).rejects.toThrow()
  expect(
    await replyContext({ ...chat, default_runner: null }, async () => {
      throw new Error("unexpected discovery")
    }),
  ).toEqual({})
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

test("a saved binding remains authoritative after the daemon stops following the chat", async () => {
  const context = await prepare(
    chat,
    async () => missing(),
    async (runner) => {
      expect(runner).toBe("remote")
      return { root: "/project", directories: ["/shared"], anchor: null }
    },
  )
  expect(context.executor_contexts?.remote).toEqual({
    "rho.environment": { root: "/project", directories: ["/shared"], anchor: null },
  })
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
