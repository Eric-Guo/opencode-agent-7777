import {
  isFormAlreadySettledError,
  isFormNotFoundError,
  type FormAnswer,
  type FormInfo,
  type SessionFormReplyInput,
  type OpenCodeEvent,
} from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import { setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { captureSessionOwnership } from "@/session/session-ownership"
import { translateSync } from "@/runtime/i18n/language"
import {
  groupSessionRequests,
  respondToRequest,
  settleRequest,
  rememberRequest,
  readSessionRequests,
  filterSettledRequests,
} from "./sync-compact"

export function refreshForms() {
  const active = captureSessionOwnership()
  const session = state.session
  if (!active || !session) return Promise.resolve()

  return readSessionRequests(
    "form",
    async (signal) =>
      (await active.client.form.list({ location: { directory: sessionDirectory(session) } }, { signal })).data,
  )
    .then((result) => {
      if (active.current() && result) setState("form", reconcile(groupSessionRequests(result)))
    })

    .catch((error) => {
      if (active.current()) throw error
    })
}

export function handleFormEvent(event: OpenCodeEvent) {
  if (event.type === "form.created") {
    const form = event.data.form
    if (form.metadata?.kind !== "question" && form.metadata?.kind !== "websearch.provider") return false
    if (!filterSettledRequests("form", [form]).length) return true
    rememberRequest("form", form)
    setState("form", form.sessionID, (current = []) => [form, ...current.filter((item) => item.id !== form.id)])
    return true
  }

  if (event.type === "form.replied" || event.type === "form.cancelled") {
    const finished = event.data
    settleRequest("form", finished)
    setState("form", finished.sessionID, (current = []) => current.filter((item) => item.id !== finished.id))
    return true
  }

  return false
}

export async function replyForm(input: SessionFormReplyInput, signal?: AbortSignal): Promise<void | "already-settled"> {
  const active = captureSessionOwnership()
  if (!active) throw new Error(translateSync("error.sessionNotReady"))
  let settled = false
  try {
    await active.client.session.form.reply(input, { signal })
  } catch (error) {
    if ((!isFormAlreadySettledError(error) && !isFormNotFoundError(error)) || error.id !== input.formID) throw error
    settled = true
  }
  if (!active.current()) return
  settleRequest("form", { sessionID: input.sessionID, id: input.formID })
  setState("form", input.sessionID, (current = []) => current.filter((form) => form.id !== input.formID))
  active.runtime.schedule(120)
  if (settled) return "already-settled"
}

export function replyQuestion(request: FormInfo, answer: FormAnswer) {
  respondToRequest("form", request, (client, signal) =>
    client.session.form.reply({ sessionID: request.sessionID, formID: request.id, answer }, { signal }),
  )
}

export function rejectQuestion(request: FormInfo) {
  respondToRequest("form", request, (client, signal) =>
    client.session.form.cancel({ sessionID: request.sessionID, formID: request.id }, { signal }),
  )
}
