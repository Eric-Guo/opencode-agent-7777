import { abortPrompt, submitPrompt } from "@/context/prompt"
import { createPromptInputController } from "@/pages/session/composer/session-composer-controls"
import { createSessionComposerController } from "@/pages/session/composer/session-composer-state"

export function createSessionComposerRegionController() {
  const promptInput = createPromptInputController()

  return {
    ...createSessionComposerController(),
    busy: promptInput.busy,
    canSubmit: promptInput.canSubmit,
    submitPrompt,
    abortPrompt,
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
