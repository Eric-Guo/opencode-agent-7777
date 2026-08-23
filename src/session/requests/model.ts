import type { FormAnswer } from "@opencode-ai/client/promise"
import { createMemo } from "solid-js"
import { state } from "@/runtime/server/session-store-compact"
import { decidePermission } from "@/session/requests/permission-sync-compact"
import { rejectQuestion, replyQuestion } from "@/session/requests/question-sync-compact"
import { sessionPermissionRequest, sessionQuestionForm } from "@/session/requests/session-request-tree"

export function createSessionRequestModel() {
  const sessions = createMemo(() => (state.session ? [state.session, ...state.recentSessions] : state.recentSessions))
  const permissionRequest = createMemo(() => sessionPermissionRequest(sessions(), state.permission, state.session?.id))
  const questionRequest = createMemo(() => sessionQuestionForm(sessions(), state.form, state.session?.id))

  return {
    blocked: createMemo(() => !!permissionRequest() || !!questionRequest()),
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
