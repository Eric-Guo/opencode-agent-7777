import { lazy } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useSessionDialog } from "@/shell/commands/session-dialog-compact"

const SessionContextTab = lazy(() => import("./tab"))

// Both the header and slash command open the same activation-scoped compact dialog.
export function useContextDialog() {
  const language = useLanguage()
  return useSessionDialog({
    id: "compact-session-context",
    title: () => language.t("context.title"),
    loading: () => language.t("context.loading"),
    failed: () => language.t("context.failed"),
    containerClass: "!h-[min(80vh,640px)] !w-[min(calc(100vw_-_16px),900px)]",
    render: (runtime) => <SessionContextTab runtime={runtime} />,
  })
}
