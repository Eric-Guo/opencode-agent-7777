import { afterEach, expect, test } from "bun:test"
import type { FormCreated, FormInfo, OpenCodeEvent, SessionFormReplyInput } from "@opencode/client/promise"
import { createRoot } from "solid-js"
import { createWebSearchRequest } from "./websearch"

const consent: FormCreated["data"]["form"] = {
  id: "frm_consent",
  sessionID: "ses_child",
  title: "Web search",
  metadata: { kind: "websearch.provider" },
  fields: [{ key: "choice", type: "string", custom: false, required: true }],
}
const options = [
  { value: "exa", label: "Exa" },
  { value: "parallel", label: "Parallel" },
]
const provider: FormCreated["data"]["form"] = {
  ...consent,
  id: "frm_provider",
  fields: [{ key: "provider", type: "string", custom: false, required: true, options }],
}
let dispose: VoidFunction | undefined
afterEach(() => dispose?.())

function fixture() {
  const listeners = new Set<(event: OpenCodeEvent) => void>()
  const replies: SessionFormReplyInput[] = []
  const lookups: { sessionID: string; signal: AbortSignal }[] = []
  const discovered: FormInfo[] = []
  const choose = Promise.withResolvers<void | "already-settled">()
  const lookup = Promise.withResolvers<FormInfo[]>()
  const model = createRoot((stop) => {
    dispose = stop
    return createWebSearchRequest({
      owner: () => consent.sessionID,
      connected: () => true,
      request: () => consent,
      providers: async () => options,
      events: {
        listen(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      },
      reply: async (reply) => {
        replies.push(reply)
        if (reply.answer.choice === "choose") return choose.promise
      },
      pendingForms: (sessionID, signal) => {
        lookups.push({ sessionID, signal })
        return lookup.promise
      },
      rememberForm: (form) => {
        discovered.push(form)
      },
    })
  })
  return {
    model,
    choose,
    lookup,
    lookups,
    discovered,
    replies,
    listeners,
    emit: (event: OpenCodeEvent) => listeners.forEach((listener) => listener(event)),
  }
}

test("listens before choose, waits for acceptance and sends an early provider exactly once", async () => {
  const f = fixture()
  await Bun.sleep(0)
  const pending = f.model.submit("parallel")
  expect(f.listeners.size).toBe(1)
  f.emit({ id: "create", created: 1, type: "form.created", data: { form: provider } })
  await f.model.submit("exa")
  expect(f.replies).toEqual([{ sessionID: consent.sessionID, formID: consent.id, answer: { choice: "choose" } }])
  f.choose.resolve()
  await pending
  expect(f.replies[1]).toEqual({ sessionID: provider.sessionID, formID: provider.id, answer: { provider: "parallel" } })
  expect(f.lookups).toHaveLength(0)
  expect(f.listeners.size).toBe(0)
})

test("a lost create event recovers only an outstanding provider for the consent's session", async () => {
  const f = fixture()
  await Bun.sleep(0)
  const pending = f.model.submit("exa")
  f.choose.resolve()
  await Bun.sleep(0)
  f.emit({ id: "cancel", created: 1, type: "form.cancelled", data: { sessionID: provider.sessionID, id: "stale" } })
  f.lookup.resolve([
    consent,
    { ...provider, metadata: { kind: "question" } },
    { ...provider, sessionID: "other" },
    { ...provider, id: "stale" },
    provider,
  ])
  await pending
  expect(f.lookups.map((item) => item.sessionID)).toEqual([consent.sessionID])
  expect(f.discovered).toEqual([provider])
  expect(f.replies.map((reply) => reply.answer)).toEqual([{ choice: "choose" }, { provider: "exa" }])
  expect(f.listeners.size).toBe(0)
})

test.each(["event", "dispose", "other-client"] as const)("ignores late pending forms after %s", async (action) => {
  const f = fixture()
  await Bun.sleep(0)
  const pending = f.model.submit("parallel")
  f.choose.resolve()
  await Bun.sleep(0)
  if (action === "dispose") dispose?.()
  if (action === "event") f.emit({ id: "create", created: 1, type: "form.created", data: { form: provider } })
  if (action === "other-client")
    f.emit({
      id: "replied",
      created: 2,
      type: "form.replied",
      data: { id: consent.id, sessionID: consent.sessionID, answer: { choice: "disable" } },
    })
  await pending
  expect(f.lookups[0]?.signal.aborted).toBe(true)
  f.lookup.resolve([provider])
  await Bun.sleep(0)
  expect(f.discovered).toEqual([])
  expect(f.replies.map((reply) => reply.answer)).toEqual(
    action === "event" ? [{ choice: "choose" }, { provider: "parallel" }] : [{ choice: "choose" }],
  )
  expect(f.listeners.size).toBe(0)
})

test.each(["already-settled", "failure"] as const)("an early provider is never answered after %s", async (outcome) => {
  const f = fixture()
  await Bun.sleep(0)
  const pending = f.model.submit("parallel")
  f.emit({ id: "create", created: 1, type: "form.created", data: { form: provider } })
  if (outcome === "already-settled") f.choose.resolve("already-settled")
  else f.choose.reject(new Error("offline"))
  await pending
  expect(f.replies).toHaveLength(1)
  expect(f.listeners.size).toBe(0)
  expect(f.model.failed()).toBe(outcome === "failure")
})
