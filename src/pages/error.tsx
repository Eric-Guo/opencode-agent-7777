import { Icon } from "@opencode-ai/ui/icon"

export function ErrorBanner(props: { error: string }) {
  return (
    <div class="mx-[22px] mb-3 flex min-h-[38px] items-center gap-2.5 rounded-lg border border-[#7a3e2b] bg-[#251713] px-2.5 py-2 text-[13px] text-[#f0a58c] [&_[data-component=icon]]:shrink-0">
      <Icon name="warning" />
      <span>{props.error}</span>
    </div>
  )
}
