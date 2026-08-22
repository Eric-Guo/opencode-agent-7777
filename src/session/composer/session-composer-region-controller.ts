import { createMemo } from "solid-js"
import { abortPrompt, submitPrompt } from "@/composer/submit-compact"
import { state } from "@/runtime/server/session-store-compact"
import { createSessionComposerController } from "@/session/requests/model-compact"

export function createSessionComposerRegionController() {
  return {
    ...createSessionComposerController(),
    busy: createMemo(() => state.submitting || state.sessionStatus.type !== "idle"),
    submitPrompt,
    abortPrompt,
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
