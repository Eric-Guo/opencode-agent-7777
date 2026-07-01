import { PromptInput } from "@/components/prompt-input"

export function SessionComposerRegion(props: {
  prompt: string
  disabled: boolean
  busy: boolean
  canSubmit: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onAbort: () => void
}) {
  return (
    <form
      class="composer"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      <PromptInput
        value={props.prompt}
        disabled={props.disabled}
        busy={props.busy}
        canSubmit={props.canSubmit}
        placeholder="Ask 7777"
        onChange={props.onPromptChange}
        onSubmit={props.onSubmit}
        onAbort={props.onAbort}
      />
    </form>
  )
}
