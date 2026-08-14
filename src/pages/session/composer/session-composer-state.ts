import { createMemo } from "solid-js"
import type { FormAnswer } from "@opencode-ai/client/promise"
import { decidePermission } from "@/context/permission-sync"
import { rejectQuestion, replyQuestion } from "@/context/question"
import { setState, state } from "@/context/server-session-store"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"
import { sessionPermissionRequest, sessionQuestionForm } from "@/pages/session/composer/session-request-tree"

export function createSessionComposerController() {
  const model = createPromptModelSelection()
  const sessions = createMemo(() => (state.session ? [state.session, ...state.recentSessions] : state.recentSessions))
  const permissionRequest = createMemo(() => sessionPermissionRequest(sessions(), state.permission, state.session?.id))
  const questionRequest = createMemo(() => sessionQuestionForm(sessions(), state.form, state.session?.id))

  return {
    disabled: createMemo(() => state.status !== "ready" || !!questionRequest()),
    model,
    modelStatus: () => state.modelStatus,
    permissionRequest,
    permissionResponding: () => state.permissionResponding === permissionRequest()?.id,
    questionRequest,
    questionResponding: () => state.questionResponding === questionRequest()?.id,
    setAttachmentError: (message: string) => setState("error", message),
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

export type SessionComposerController = ReturnType<typeof createSessionComposerController>
