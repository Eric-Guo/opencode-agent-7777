import type { ClientSlashCommand } from "@/composer/client-slash-command"
import { useContextDialog } from "@/context/dialog-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { currentRuntime, state } from "@/runtime/server/session-store-compact"
import { createSessionExporter } from "./export-session"

// The embedded session supplies local actions directly to its composer instead of a host command provider.
export function useSessionCommands() {
  const language = useLanguage()
  const openContext = useContextDialog()
  const exporter = createSessionExporter(language)

  return (): ClientSlashCommand[] =>
    state.session
      ? [
          {
            id: "session.export",
            trigger: "export",
            title: language.t("command.session.export"),
            description: language.t("command.session.export.description"),
            onSelect: () => void exporter.export(),
          },
          {
            id: "session.context",
            trigger: "context",
            title: language.t("usage.view"),
            description: language.t("command.session.context.description"),
            onSelect: () => {
              const runtime = currentRuntime()
              // Let the command menu restore the editor before the dialog captures its return focus.
              requestAnimationFrame(() => {
                if (runtime && currentRuntime() === runtime) openContext()
              })
            },
          },
        ]
      : []
}
