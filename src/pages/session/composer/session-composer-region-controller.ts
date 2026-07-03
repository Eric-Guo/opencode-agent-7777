import { createMemo } from "solid-js"
import { modelSelector } from "@/context/models"
import { decidePermission } from "@/context/permission"
import { abortPrompt, addAttachment, removeAttachment, setPrompt, submitPrompt } from "@/context/prompt"
import { setState, state } from "@/context/sync"
import { createPromptInputController } from "@/pages/session/composer/session-composer-controls"

export function createSessionComposerRegionController() {
  const promptInput = createPromptInputController()
  const disabled = createMemo(() => state.status !== "ready")

  return {
    prompt: () => state.prompt,
    attachments: () => state.attachments,
    disabled,
    busy: promptInput.busy,
    canSubmit: promptInput.canSubmit,
    model: modelSelector,
    modelStatus: () => state.modelStatus,
    permissionRequest: () => state.permissionRequest,
    permissionResponding: () => state.permissionResponding,
    setPrompt,
    addAttachment,
    removeAttachment,
    setAttachmentError: (message: string) => setState("error", message),
    decidePermission,
    submitPrompt,
    abortPrompt,
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
