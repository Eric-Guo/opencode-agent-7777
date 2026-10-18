import type { Accessor } from "solid-js"
import type { PromptState } from "./state"
import type { ComposerSuggestion } from "./types"

export type ClientSlashCommand = {
  id: string
  trigger: string
  title: string
  description?: string
  onSelect: () => void
}

export function parseSlashCommand(text: string) {
  if (!text.startsWith("/")) return
  const separator = text.search(/\s/)
  const name = text.slice(1, separator === -1 ? undefined : separator)
  return { name, input: separator === -1 ? "" : text.slice(separator).trim() }
}

export function parseClientSlashCommand(options: readonly ClientSlashCommand[], text: string) {
  const command = parseSlashCommand(text)
  if (!command) return
  const option = options.find((item) => item.trigger === command.name)
  if (!option) return
  return { id: option.id, input: command.input }
}

export function createClientSlashCommands(input: {
  commands: Accessor<ClientSlashCommand[]>
  draft: PromptState
  beforeSelect: () => void
  onArguments: (command: string) => void
}) {
  const select = (id: string) => {
    const command = input.commands().find((item) => item.id === id)
    if (!command) return
    return () => {
      input.beforeSelect()
      command.onSelect()
    }
  }
  return {
    suggestions: (): ComposerSuggestion[] =>
      input.commands().map((command) => ({
        id: command.id,
        kind: "command",
        label: `/${command.trigger}`,
        trigger: command.trigger,
        title: command.title,
        description: command.description,
      })),
    select,
    submit(text: string) {
      const command = parseClientSlashCommand(input.commands(), text.trim())
      if (!command) return false
      if (command.input) {
        input.onArguments(`/${parseSlashCommand(text.trim())!.name}`)
        return true
      }
      input.draft.set("")
      select(command.id)?.()
      return true
    },
  }
}
