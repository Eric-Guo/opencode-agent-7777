import type { Accessor } from "solid-js"
import type { ModelSelectorState } from "@/providers/models/selection"

type ModelCommand = "model.cycle" | "model.cycle.reverse" | "model.variant.cycle"
type CommandKeyEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "defaultPrevented" | "repeat"
>

export function composerModelCommand(event: CommandKeyEvent, isMac: boolean): ModelCommand | undefined {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey) return
  if (event.key === "F2" && !event.ctrlKey && !event.metaKey) {
    return event.shiftKey ? "model.cycle.reverse" : "model.cycle"
  }
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (mod && event.shiftKey && event.key.toLowerCase() === "d") return "model.variant.cycle"
}

// The embedded composer owns these shortcuts; no document listener or host command provider is needed.
export function useComposerCommands(input: {
  model: Accessor<ModelSelectorState>
  disabled: Accessor<boolean>
  isMac: boolean
}) {
  return {
    variantKeybind: ["Shift", input.isMac ? "⌘" : "Ctrl", "D"],
    onKeyDown(event: KeyboardEvent) {
      if (input.disabled()) return false
      const command = composerModelCommand(event, input.isMac)
      if (!command) return false
      const model = input.model()
      if (command === "model.variant.cycle" ? !model.variant.list().length : !model.recent().length) return false
      event.preventDefault()
      event.stopPropagation()
      if (command === "model.variant.cycle") model.variant.cycle()
      else model.cycle(command === "model.cycle" ? 1 : -1)
      return true
    },
  }
}
