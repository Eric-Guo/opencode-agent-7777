import { createMemo } from "solid-js"
import { selectModel } from "@/context/models"
import { decidePermission } from "@/context/permission"
import { setState, state } from "@/context/sync"
import { createPromptInputController } from "@/pages/session/composer/session-composer-controls"
import {
  abortPrompt,
  addAttachment,
  removeAttachment,
  setPrompt,
  submitPrompt,
} from "@/pages/session/composer/session-composer-state"

export function createSessionComposerRegionController() {
  const promptInput = createPromptInputController()
  const disabled = createMemo(() => state.status !== "ready")

  return {
    prompt: () => state.prompt,
    attachments: () => state.attachments,
    disabled,
    busy: promptInput.busy,
    canSubmit: promptInput.canSubmit,
    models: () => state.models,
    selectedModel: () => state.selectedModel,
    modelStatus: () => state.modelStatus,
    permissionRequest: () => state.permissionRequest,
    permissionResponding: () => state.permissionResponding,
    setPrompt,
    addAttachment,
    removeAttachment,
    setAttachmentError: (message: string) => setState("error", message),
    selectModel,
    decidePermission,
    submitPrompt,
    abortPrompt,
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
