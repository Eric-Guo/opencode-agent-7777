import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"

export function PromptInput(props: {
  value: string
  disabled: boolean
  busy: boolean
  canSubmit: boolean
  placeholder: string
  onChange: (value: string) => void
  onSubmit: () => void
  onAbort: () => void
}) {
  return (
    <>
      <textarea
        aria-label="Message"
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        onInput={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return
          event.preventDefault()
          props.onSubmit()
        }}
      />
      <button
        type={props.busy ? "button" : "submit"}
        class="submit-button"
        aria-label={props.busy ? "Stop" : "Send"}
        disabled={!props.busy && !props.canSubmit}
        onClick={() => {
          if (props.busy) props.onAbort()
        }}
      >
        <Show when={props.busy} fallback={<Icon name="arrow-up" />}>
          <Icon name="stop" />
        </Show>
      </button>
    </>
  )
}
