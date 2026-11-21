import type { FormAnswer } from "@opencode/client/promise"
import { createEffect, createMemo, on } from "solid-js"
import { currentRuntime, currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { sessionDirectory } from "@/session/directory"
import { translateSync } from "@/runtime/i18n/language"
import { decidePermission, notifyCurrentPermission } from "@/session/requests/permission-sync-compact"
import { rejectQuestion, replyQuestion, replyForm } from "@/session/requests/form-sync-compact"
import { isRoutedForm, sessionPermissionRequest, sessionFormRequest, sessionTreeIDs } from "./session-request-tree"
import { requestSessions } from "./sync-compact"
import { createWebSearchRequest } from "./websearch"

export function createSessionRequestModel() {
  const sessions = createMemo(requestSessions)
  createEffect(() => {
    const runtime = currentRuntime()
    if (!runtime) return
    if (runtime.id !== state.session?.id) return runtime.requestAncestry.update([], [])
    const owners = new Set(Object.keys(state.permission).filter((id) => state.permission[id]?.length))
    for (const id of Object.keys(state.form)) {
      if (state.form[id]?.some(isRoutedForm)) owners.add(id)
    }
    runtime.requestAncestry.update(state.recentSessions, [...owners])
  })
  const permissionRequest = createMemo(() => sessionPermissionRequest(sessions(), state.permission, sessions()[0]?.id))
  const formRequest = createMemo(() => sessionFormRequest(sessions(), state.form, sessions()[0]?.id))
  // An ask or snapshot can arrive before the recent page or the GET that connects its owner to this tree.
  createEffect(
    on(
      () => sessionTreeIDs(sessions(), sessions()[0]?.id),
      (ids, previous) => {
        const request = permissionRequest()
        if (request && previous && ids.includes(request.sessionID) && !previous.includes(request.sessionID))
          notifyCurrentPermission(request)
      },
    ),
  )
  const websearch = createWebSearchRequest({
    owner: createMemo(() => {
      const runtime = currentRuntime()
      return runtime?.id === state.session?.id ? runtime : undefined
    }),
    connected: () => state.status === "ready" && state.eventsConnected,
    request: () => {
      const form = formRequest()
      return form?.metadata?.kind === "websearch.provider" ? form : undefined
    },
    providers: async (sessionID, signal) => {
      const active = currentSession()
      if (!active) throw new Error(translateSync("error.sessionNotReady"))
      const session =
        sessions().find((session) => session.id === sessionID) ??
        (await active.client.session.get({ sessionID }, { signal }))
      const result = await active.client.websearch.providers(
        { location: { directory: sessionDirectory(session) } },
        { signal },
      )
      return result.data.map((provider) => ({ value: provider.id, label: provider.name }))
    },
    pendingForms: (sessionID, signal) => {
      const active = currentSession()
      if (!active) throw new Error(translateSync("error.sessionNotReady"))
      return active.client.session.form.list({ sessionID }, { signal })
    },
    rememberForm: (form) =>
      setState("form", form.sessionID, (current = []) =>
        current.some((item) => item.id === form.id) ? current : [...current, form],
      ),
    reply: replyForm,
    events: sessionEvents,
  })
  const questionRequest = createMemo(() => {
    if (websearch.request()) return
    const form = formRequest()
    return form?.metadata?.kind === "question" ? form : undefined
  })

  return {
    blocked: createMemo(() => !!permissionRequest() || !!questionRequest() || !!websearch.request()),
    websearch,
    permissionRequest,
    permissionResponding: () => state.permissionResponding === permissionRequest()?.id,
    questionRequest,
    questionResponding: () => state.questionResponding === questionRequest()?.id,
    decidePermission(response: "once" | "always" | "reject") {
      const request = permissionRequest()
      if (request) decidePermission(request, response)
    },
    replyQuestion(answer: FormAnswer) {
      const request = questionRequest()
      if (request) replyQuestion(request, answer)
    },
    rejectQuestion() {
      const request = questionRequest()
      if (request) rejectQuestion(request)
    },
  }
}

export type SessionRequestModel = ReturnType<typeof createSessionRequestModel>
