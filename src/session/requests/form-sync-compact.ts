import {
  isFormAlreadySettledError,
  isFormNotFoundError,
  type FormAnswer,
  type FormInfo,
  type SessionFormReplyInput,
  type OpenCodeEvent,
} from "@opencode/client/promise"
import { reconcile } from "solid-js/store"
import type { FormWithLocation } from "@opencode/client/solid"
import { isCurrentDirectory, setState, state } from "@/runtime/server/session-store-compact"
import { sessionDirectory } from "@/session/directory"
import { captureSessionOwnership } from "@/session/session-ownership"
import { translateSync } from "@/runtime/i18n/language"
import { isRoutedForm } from "./session-request-tree"
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

  const directory = sessionDirectory(session)
  return readSessionRequests("form", async (signal) => {
    const page = await active.client.form.list({ location: { directory } }, { signal })
    const location = page.location ?? { directory }
    return page.data.map((form): FormWithLocation => (form.sessionID === "global" ? { ...form, location } : form))
  })
    .then((result) => {
      if (active.current() && isCurrentDirectory(directory) && result)
        setState("form", reconcile(groupSessionRequests(result)))
    })
    .catch((error) => {
      if (active.current() && isCurrentDirectory(directory)) throw error
    })
}

export function handleFormEvent(event: OpenCodeEvent) {
  if (event.type === "form.created") {
    const wire = event.data.form
    if (wire.sessionID === "global" && (!event.location || !isCurrentDirectory(event.location.directory))) return true
    const form = wire.sessionID === "global" ? { ...wire, location: event.location } : wire
    if (!isRoutedForm(form)) return false
    if (!filterSettledRequests("form", [form]).length) return true
    rememberRequest("form", form)
    // Forms are immutable while pending. A replay must keep the dock and its draft mounted.
    if (form.metadata?.kind === "mcp-elicitation" && state.form[form.sessionID]?.some((item) => item.id === form.id))
      return true
    setState("form", form.sessionID, (current = []) => [form, ...current.filter((item) => item.id !== form.id)])
    return true
  }

  if (event.type === "form.replied" || event.type === "form.cancelled") {
    const finished = event.data
    if (finished.sessionID === "global" && (!event.location || !isCurrentDirectory(event.location.directory)))
      return true
    settleRequest("form", finished)
    setState("form", finished.sessionID, (current = []) => current.filter((item) => item.id !== finished.id))
    return true
  }

  return false
}

function isSettledFormError(error: unknown, formID: string) {
  return (isFormAlreadySettledError(error) || isFormNotFoundError(error)) && error.id === formID
}

export async function replyForm(input: SessionFormReplyInput, signal?: AbortSignal): Promise<void | "already-settled"> {
  const active = captureSessionOwnership()
  if (!active) throw new Error(translateSync("error.sessionNotReady"))
  let settled = false
  try {
    await active.client.session.form.reply(input, { signal })
  } catch (error) {
    if (!isSettledFormError(error, input.formID)) throw error
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

export function submitElicitationResponse(request: FormWithLocation, answer?: FormAnswer) {
  const { sessionID, id: formID } = request
  const directory = sessionID === "global" ? request.location?.directory : undefined
  if (sessionID === "global" && (!directory || !isCurrentDirectory(directory))) return
  respondToRequest("form", request, async (client, signal) => {
    const options = {
      signal,
      headers: directory ? { "x-opencode-directory": encodeURIComponent(directory) } : undefined,
    }
    try {
      if (answer === undefined) await client.session.form.cancel({ sessionID, formID }, options)
      else await client.session.form.reply({ sessionID, formID, answer }, options)
    } catch (error) {
      if (!isSettledFormError(error, formID)) throw error
    }
  })
}
