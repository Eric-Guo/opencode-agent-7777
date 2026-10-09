import type { FormAnswer, FormInfo, SessionFormReplyInput, OpenCodeEvent } from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { scheduleRefresh } from "@/runtime/server/sync-session-compact"
import { currentSession, currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { translateSync } from "@/runtime/i18n/language"
import { groupSessionRequests, respondToRequest } from "./sync-compact"

export function refreshForms() {
  const active = currentSession()
  const runtime = currentRuntime()
  const session = state.session
  if (!active || !session) return Promise.resolve()

  return active.client.form
    .list({ location: { directory: sessionDirectory(session) } })
    .then((result) => {
      if (currentRuntime() === runtime && state.session?.id === active.sessionID)
        setState("form", reconcile(groupSessionRequests(result.data)))
    })
    .finally(() => {
      if (currentRuntime() === runtime && state.session?.id === active.sessionID)
        setState("questionResponding", undefined)
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

export async function replyForm(input: SessionFormReplyInput) {
  const active = currentSession()
  const runtime = currentRuntime()
  if (!active) throw new Error(translateSync("error.sessionNotReady"))
  await active.client.session.form.reply(input)
  if (currentRuntime() !== runtime || state.session?.id !== active.sessionID) return
  setState("form", input.sessionID, (current = []) => current.filter((form) => form.id !== input.formID))
  scheduleRefresh(120)
}

export function replyQuestion(request: FormInfo, answer: FormAnswer) {
  respondToRequest("form", request, (client) =>
    client.session.form.reply({ sessionID: request.sessionID, formID: request.id, answer }),
  )
}

export function rejectQuestion(request: FormInfo) {
  respondToRequest("form", request, (client) =>
    client.session.form.cancel({ sessionID: request.sessionID, formID: request.id }),
  )
}
