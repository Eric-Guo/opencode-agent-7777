import { Icon } from "@opencode-ai/ui/icon"

export function ErrorBanner(props: { error: string }) {
  return (
    <div class="error-banner">
      <Icon name="warning" />
      <span>{props.error}</span>
    </div>
  )
}
