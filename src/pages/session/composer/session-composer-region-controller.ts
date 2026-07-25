import { createMemo } from "solid-js"
import { abortPrompt, submitPrompt } from "@/components/prompt-input/submit"
import { state } from "@/context/server-session-store"
import { createSessionComposerController } from "@/pages/session/composer/session-composer-state"

export function createSessionComposerRegionController() {
  return {
    ...createSessionComposerController(),
    busy: createMemo(() => state.submitting || state.sessionStatus.type !== "idle"),
    submitPrompt,
    abortPrompt,
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
