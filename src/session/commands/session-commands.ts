import type { ClientSlashCommand } from "@/composer/client-slash-command"
import { useContextDialog } from "@/context/dialog-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { currentRuntime, state } from "@/runtime/server/session-store-compact"
import { createSessionActions } from "./session-actions"
import { createSessionExporter } from "./export-session"

// The embedded session supplies local actions directly to its composer instead of a host command provider.
export function createSessionCommands() {
  const language = useLanguage()
  const exporter = createSessionExporter(language)
  const openContext = useContextDialog(exporter)
  const actions = createSessionActions()

  const commands = (openFork?: () => void): ClientSlashCommand[] =>
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
          ...(openFork
            ? [
                {
                  id: "session.fork",
                  trigger: "fork",
                  title: language.t("command.session.fork"),
                  description: language.t("command.session.fork.description"),
                  whenServerMissing: true,
                  onSelect: openFork,
                },
              ]
            : []),
        ]
      : []

  return { commands, openContext, exporter, actions }
}
