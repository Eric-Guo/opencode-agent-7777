import { createSignal } from "solid-js"

export function createPromptInputTransientState() {
  const [modelOpen, setModelOpen] = createSignal(false)

  return {
    modelOpen,
    setModelOpen,
  }
}
