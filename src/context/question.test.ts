import { afterEach, describe, expect, test } from "bun:test"
import type { FormInfo, OpenCodeEvent } from "@opencode-ai/client/promise"
import { reconcile } from "solid-js/store"
import { handleQuestionEvent } from "@/context/question"
import { setState, state } from "@/context/server-session-store"
import { isQuestionForm, questionFormAnswer } from "@/utils/question-form"

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

  test("maps displayed option labels back to protocol values", () => {
    expect(isQuestionForm(form)).toBeTrue()
    if (!isQuestionForm(form)) throw new Error("Expected a question form")

    expect(questionFormAnswer(form, [["Option A"]])).toEqual({ choice: "option-a" })
    expect(questionFormAnswer(form, [["Custom answer"]])).toEqual({ choice: "Custom answer" })
  })
})
