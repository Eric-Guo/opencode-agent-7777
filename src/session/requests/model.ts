import type { FormAnswer } from "@opencode/client/promise"
import { createMemo } from "solid-js"
import { currentSession, state } from "@/runtime/server/session-store-compact"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { sessionDirectory } from "@/session/directory"
import { translateSync } from "@/runtime/i18n/language"
import { decidePermission } from "@/session/requests/permission-sync-compact"
import { rejectQuestion, replyQuestion, replyForm } from "@/session/requests/form-sync-compact"
import { sessionPermissionRequest, sessionFormRequest } from "@/session/requests/session-request-tree"
import { createWebSearchRequest } from "./websearch"

export function createSessionRequestModel() {
  const sessions = createMemo(() => (state.session ? [state.session, ...state.recentSessions] : state.recentSessions))
  const permissionRequest = createMemo(() => sessionPermissionRequest(sessions(), state.permission, state.session?.id))
  const formRequest = createMemo(() => sessionFormRequest(sessions(), state.form, state.session?.id))
  const websearch = createWebSearchRequest({
    owner: () => state.session?.id,
    connected: () => state.status === "ready" && state.eventsConnected,
    request: () => {
      const form = formRequest()
      return form?.metadata?.kind === "websearch.provider" ? form : undefined
    },
    providers: async (sessionID) => {
      const active = currentSession()
      if (!active) throw new Error(translateSync("error.sessionNotReady"))
      const session =
        sessions().find((session) => session.id === sessionID) ?? (await active.client.session.get({ sessionID }))
      const result = await active.client.websearch.providers({ location: { directory: sessionDirectory(session) } })
      return result.data.map((provider) => ({ value: provider.id, label: provider.name }))
    },
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
