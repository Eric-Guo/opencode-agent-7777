import { createMemo } from "solid-js"
import { decidePermission } from "@/context/permission-sync"
import { rejectQuestion, replyQuestion } from "@/context/question"
import { setState, state } from "@/context/server-session-store"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"

export function createSessionComposerController() {
  const model = createPromptModelSelection()

  return {
    disabled: createMemo(() => state.status !== "ready" || !!state.questionRequest),
    model,
    modelStatus: () => state.modelStatus,
    permissionRequest: () => state.permissionRequest,
    permissionResponding: () => state.permissionResponding,
    questionRequest: () => state.questionRequest,
    questionResponding: () => state.questionResponding,
    setAttachmentError: (message: string) => setState("error", message),
    decidePermission,
    replyQuestion,
    rejectQuestion,
  }
}

export type SessionComposerController = ReturnType<typeof createSessionComposerController>
