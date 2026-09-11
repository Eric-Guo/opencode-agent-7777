import { afterEach, describe, expect, test } from "bun:test"
import type { FormInfo, OpenCodeEvent, SessionInfo } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { handleFormEvent, refreshForms, replyForm } from "@/session/requests/form-sync-compact"
import { setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { disposeRefreshQueue } from "@/runtime/server/global-sync/queue-message-refresh"

const form = {
  id: "form_test",
  sessionID: "session_test",
  title: "Questions",
  metadata: { kind: "question" },
  fields: [
    {
      key: "choice",
      type: "string",
      options: [{ value: "option-a", label: "Option A" }],
    },
  ],
} satisfies FormInfo

afterEach(() => {
  disposeRefreshQueue()
  setSessionClient(undefined)
  setState("session", undefined)
  setState("form", reconcile({}))
  setState("questionResponding", undefined)
})

describe("form sync", () => {
  test("keeps web search forms from SSE and removes cancelled requests", () => {
    expect(
      handleFormEvent({
        id: "created",
        created: 1,
        type: "form.created",
        data: {
          form: { ...form, metadata: { kind: "websearch.provider" } },
        },
      }),
    ).toBe(true)
    expect(state.form.session_test?.map((form) => form.metadata?.kind)).toEqual(["websearch.provider"])
    handleFormEvent({
      id: "cancelled",
      created: 2,
      type: "form.cancelled",
      data: { id: form.id, sessionID: form.sessionID },
    })
    expect(state.form.session_test).toEqual([])
  })

  test("removes only the replied form while preserving a subsequent provider form", async () => {
    setState("session", { id: "session_test", location: { directory: "/repo" } } as SessionInfo)
    setState("form", "session_test", [form, { ...form, id: "form_provider", metadata: { kind: "websearch.provider" } }])
    const replies: unknown[] = []
    setSessionClient({
      form: {
        reply: async (input: unknown) => {
          replies.push(input)
        },
      },
    } as unknown as OpencodeClient)
    await replyForm({ sessionID: form.sessionID, formID: form.id, answer: { choice: "choose" } })
    expect(replies).toEqual([{ sessionID: "session_test", formID: "form_test", answer: { choice: "choose" } }])
    expect(state.form.session_test?.map((item) => item.id)).toEqual(["form_provider"])
  })

  test("discards a forms refresh completed after switching sessions", async () => {
    setState("session", { id: "session_test", location: { directory: "/repo" } } as SessionInfo)
    const result = Promise.withResolvers<{ data: FormInfo[] }>()
    setSessionClient({ form: { request: { list: () => result.promise } } } as unknown as OpencodeClient)
    const pending = refreshForms()
    setState("session", { id: "new_session", location: { directory: "/new" } } as SessionInfo)
    setState("form", "new_session", [{ ...form, id: "new_form", sessionID: "new_session" }])
    setState("questionResponding", "new_form")
    result.resolve({ data: [form] })
    await pending
    expect(state.form.session_test).toBeUndefined()
    expect(state.form.new_session?.map((item) => item.id)).toEqual(["new_form"])
    expect(state.questionResponding).toBe("new_form")
  })

  test("adds and removes pending question forms from current events", () => {
    const created = {
      id: "event_created",
      created: 1,
      type: "form.created",
      data: { form },
    } satisfies Extract<OpenCodeEvent, { type: "form.created" }>

    expect(handleFormEvent(created)).toBeTrue()
    expect(state.form.session_test).toEqual([form])

    const replied = {
      id: "event_replied",
      created: 2,
      type: "form.replied",
      data: { id: form.id, sessionID: form.sessionID, answer: { choice: "option-a" } },
    } satisfies Extract<OpenCodeEvent, { type: "form.replied" }>

    expect(handleFormEvent(replied)).toBeTrue()
    expect(state.form.session_test).toEqual([])
  })

  test("ignores forms that are not questions", () => {
    const created = {
      id: "event_created",
      created: 1,
      type: "form.created",
      data: { form: { ...form, metadata: { kind: "other" } } },
    } satisfies Extract<OpenCodeEvent, { type: "form.created" }>

    expect(handleFormEvent(created)).toBeFalse()
    expect(state.form.session_test).toBeUndefined()
  })
})
