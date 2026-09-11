import type { FormAnswer, FormInfo, FormReplyInput, OpenCodeEvent } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { readableError } from "@/shell/errors/readable"
import { translateSync } from "@/runtime/i18n/language"

function groupForms(forms: FormInfo[]) {
  return forms.reduce<Record<string, FormInfo[]>>((result, form) => {
    const current = result[form.sessionID]
    if (current) current.push(form)
    if (!current) result[form.sessionID] = [form]
    return result
  }, {})
}

export function refreshForms() {
  const active = currentSession()
  const session = state.session
  if (!active || !session) return Promise.resolve()

  return active.client.form.request
    .list({ location: { directory: sessionDirectory(session) } })
    .then((result) => {
      if (state.session?.id === active.sessionID) setState("form", reconcile(groupForms(result.data)))
    })
    .finally(() => {
      if (state.session?.id === active.sessionID) setState("questionResponding", undefined)
    })
}

export function handleFormEvent(event: OpenCodeEvent) {
  if (event.type === "form.created") {
    const form = event.data.form
    if (form.metadata?.kind !== "question" && form.metadata?.kind !== "websearch.provider") return false
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

export async function replyForm(input: FormReplyInput) {
  const active = currentSession()
  if (!active) throw new Error(translateSync("error.sessionNotReady"))
  await active.client.form.reply(input)
  if (state.session?.id !== active.sessionID) return
  setState("form", input.sessionID, (current = []) => current.filter((form) => form.id !== input.formID))
  scheduleRefresh(120)
}

export function replyQuestion(request: FormInfo, answer: FormAnswer) {
  const active = currentSession()
  if (!request || !active || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", request.id)
  void replyForm({ sessionID: request.sessionID, formID: request.id, answer })
    .catch((error) => {
      if (state.session?.id !== active.sessionID) return
      setState("error", readableError(error))
    })
    .finally(() => {
      if (state.session?.id !== active.sessionID) return
      setState("questionResponding", (current) => (current === request.id ? undefined : current))
    })
}

export function rejectQuestion(request: FormInfo) {
  const active = currentSession()
  if (!request || !active || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", request.id)
  void active.client.form
    .cancel({ sessionID: request.sessionID, formID: request.id })
    .then(() => {
      if (state.session?.id !== active.sessionID) return
      setState("form", request.sessionID, (current = []) => current.filter((item) => item.id !== request.id))
      scheduleRefresh(120)
    })
    .catch((error) => {
      if (state.session?.id !== active.sessionID) return
      setState("error", readableError(error))
    })
    .finally(() => {
      if (state.session?.id !== active.sessionID) return
      setState("questionResponding", (current) => (current === request.id ? undefined : current))
    })
}
