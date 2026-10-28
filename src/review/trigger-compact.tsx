import { Icon } from "@opencode/ui/icon"
import { lazy } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { currentRuntime } from "@/runtime/server/session-store-compact"
import { useSessionDialog } from "@/shell/commands/session-dialog-compact"

const ReviewPanel = lazy(() => import("./panel"))

// Upstream mounts review through the extension host; the compact app opens a dialog.
export function ReviewTrigger() {
  const language = useLanguage()
  const open = useSessionDialog({
    id: "compact-session-review",
    title: () => language.t("review.title"),
    loading: () => language.t("review.loading"),
    failed: () => language.t("review.loadFailed"),
    containerClass: "!h-[min(80vh,900px)] !w-[min(calc(100vw_-_16px),1100px)]",
    render: (runtime) => <ReviewPanel runtime={runtime} />,
  })

  return (
    <button
      type="button"
      class="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 text-v2-text-text-muted hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base disabled:opacity-55"
      aria-label={language.t("review.title")}
      title={language.t("review.title")}
      disabled={!currentRuntime()}
      onClick={open}
    >
      <Icon name="code" size="small" />
    </button>
  )
}
