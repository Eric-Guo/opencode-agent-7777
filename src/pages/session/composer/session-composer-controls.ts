import { createMemo } from "solid-js"
import { prompt } from "@/context/prompt"
import { state } from "@/context/server-session-store"

export function createPromptInputController() {
  const busy = createMemo(() => state.submitting || state.sessionStatus.type !== "idle")
  const canSubmit = createMemo(
    () =>
      prompt.dirty() && !state.submitting && state.status === "ready",
  )

  return {
    busy,
    canSubmit,
  }
}
