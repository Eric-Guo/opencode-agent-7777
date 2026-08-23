import { createMemo } from "solid-js"
import { abortPrompt, submitPrompt } from "@/composer/submit-compact"
import { createPromptModelSelection } from "@/composer/selection"
import { setState, state } from "@/runtime/server/session-store-compact"
import { createSessionRequestModel } from "@/session/requests/model"

export function createSessionComposerRegionController() {
  const request = createSessionRequestModel()
  return {
    ...request,
    disabled: createMemo(() => state.status !== "ready" || !!request.questionRequest()),
    busy: createMemo(() => state.submitting || state.sessionStatus.type !== "idle"),
    model: createPromptModelSelection(),
    modelStatus: () => state.modelStatus,
    setAttachmentError: (message: string) => setState("error", message),
    submitPrompt,
    abortPrompt,
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
