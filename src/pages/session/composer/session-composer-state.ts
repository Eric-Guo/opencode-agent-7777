import { createMemo } from "solid-js"
import { modelSelector } from "@/context/models"
import { decidePermission } from "@/context/permission"
import { rejectQuestion, replyQuestion } from "@/context/question"
import { addAttachment, removeAttachment, setPrompt } from "@/context/prompt"
import { setState, state } from "@/context/server-session"

export function createSessionComposerController() {
  return {
    prompt: () => state.prompt,
    attachments: () => state.attachments,
    disabled: createMemo(() => state.status !== "ready" || !!state.questionRequest),
    model: modelSelector,
    modelStatus: () => state.modelStatus,
    permissionRequest: () => state.permissionRequest,
    permissionResponding: () => state.permissionResponding,
    questionRequest: () => state.questionRequest,
    questionResponding: () => state.questionResponding,
    setPrompt,
    addAttachment,
    removeAttachment,
    setAttachmentError: (message: string) => setState("error", message),
    decidePermission,
    replyQuestion,
    rejectQuestion,
  }
}

export type SessionComposerController = ReturnType<typeof createSessionComposerController>
