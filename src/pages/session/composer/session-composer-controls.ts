import { createMemo } from "solid-js"
import { state } from "@/context/server-session-store"

export function createPromptInputController() {
  const busy = createMemo(() => state.submitting || state.sessionStatus.type !== "idle")
  const canSubmit = createMemo(
    () =>
      (state.prompt.trim().length > 0 || state.attachments.length > 0) && !state.submitting && state.status === "ready",
  )

  return {
    busy,
    canSubmit,
  }
}
