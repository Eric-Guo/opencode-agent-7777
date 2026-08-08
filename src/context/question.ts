import type { FormInfo, OpenCodeEvent } from "@opencode-ai/client/promise"
import { reconcile } from "solid-js/store"
import { scheduleRefresh } from "@/context/server-sync-session"
import { currentSession, setState, state } from "@/context/server-session-store"
import { sessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"
import { isQuestionForm, questionFormAnswer, type QuestionForm } from "@/utils/question-form"

function groupForms(forms: FormInfo[]) {
  return forms.reduce<Record<string, FormInfo[]>>((result, form) => {
    const current = result[form.sessionID]
    if (current) current.push(form)
    if (!current) result[form.sessionID] = [form]
    return result
  }, {})
}

export function refreshQuestions() {
  const active = currentSession()
  const session = state.session
  if (!active || !session) return Promise.resolve()

  return active.client.form.request
    .list({ location: { directory: sessionDirectory(session) } })
    .then((result) => setState("form", reconcile(groupForms(result.data))))
    .finally(() => setState("questionResponding", undefined))
}

export function handleQuestionEvent(event: OpenCodeEvent) {
  if (event.type === "form.created" && isQuestionForm(event.data.form)) {
    const form = event.data.form
    setState("form", form.sessionID, (current = []) => [form, ...current.filter((item) => item.id !== form.id)])
    return true
  }

  if (event.type === "form.replied" || event.type === "form.cancelled") {
    const finished = event.data
    setState("form", finished.sessionID, (current = []) => current.filter((item) => item.id !== finished.id))
    setState("questionResponding", (current) => (current === finished.id ? undefined : current))
    return true
  }

  return false
}

export function replyQuestion(request: QuestionForm, answers: string[][]) {
  const active = currentSession()
  if (!request || !active || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", request.id)
  void active.client.form
    .reply({ sessionID: request.sessionID, formID: request.id, answer: questionFormAnswer(request, answers) })
    .then(() => {
      setState("form", request.sessionID, (current = []) => current.filter((item) => item.id !== request.id))
      scheduleRefresh(120)
    })
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      setState("questionResponding", (current) => (current === request.id ? undefined : current))
    })
}

export function rejectQuestion(request: QuestionForm) {
  const active = currentSession()
  if (!request || !active || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", request.id)
  void active.client.form
    .cancel({ sessionID: request.sessionID, formID: request.id })
    .then(() => {
      setState("form", request.sessionID, (current = []) => current.filter((item) => item.id !== request.id))
      scheduleRefresh(120)
    })
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      setState("questionResponding", (current) => (current === request.id ? undefined : current))
    })
}
