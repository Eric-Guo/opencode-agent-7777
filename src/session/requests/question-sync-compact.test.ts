import { afterEach, describe, expect, test } from "bun:test"
import type { FormInfo, OpenCodeEvent } from "@opencode-ai/client/promise"
import { reconcile } from "solid-js/store"
import { handleQuestionEvent } from "@/session/requests/question-sync-compact"
import { setState, state } from "@/runtime/server/session-store-compact"

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
  setState("form", reconcile({}))
  setState("questionResponding", undefined)
})

describe("question form sync", () => {
  test("adds and removes pending question forms from current events", () => {
    const created = {
      id: "event_created",
      created: 1,
      type: "form.created",
      data: { form },
    } satisfies Extract<OpenCodeEvent, { type: "form.created" }>

    expect(handleQuestionEvent(created)).toBeTrue()
    expect(state.form.session_test).toEqual([form])

    const replied = {
      id: "event_replied",
      created: 2,
      type: "form.replied",
      data: { id: form.id, sessionID: form.sessionID, answer: { choice: "option-a" } },
    } satisfies Extract<OpenCodeEvent, { type: "form.replied" }>

    expect(handleQuestionEvent(replied)).toBeTrue()
    expect(state.form.session_test).toEqual([])
  })

  test("ignores forms that are not questions", () => {
    const created = {
      id: "event_created",
      created: 1,
      type: "form.created",
      data: { form: { ...form, metadata: { kind: "other" } } },
    } satisfies Extract<OpenCodeEvent, { type: "form.created" }>

    expect(handleQuestionEvent(created)).toBeFalse()
    expect(state.form.session_test).toBeUndefined()
  })
})
