import { showToast, toaster } from "@opencode/ui/toast"
import type { ClientSlashCommand } from "@/composer/client-slash-command"
import { useContextDialog } from "@/context/dialog-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { currentRuntime, currentSession, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { downloadSessionExport, fetchSessionExport, sessionExportFilename } from "./export"

// The embedded session supplies local actions directly to its composer instead of a host command provider.
export function useSessionCommands() {
  const language = useLanguage()
  const openContext = useContextDialog()
  let exporting = false

  const exportSession = async () => {
    if (exporting) return
    const active = currentSession()
    if (!active) return
    exporting = true
    setState("error", "")
    const notification = showToast({
      variant: "loading",
      title: language.t("toast.session.export.loading"),
      persistent: true,
    })
    try {
      const data = await fetchSessionExport({ sessionID: active.sessionID, api: active.client })
      const filename = sessionExportFilename(data.info)
      downloadSessionExport(filename, data)
      showToast({
        variant: "success",
        title: language.t("toast.session.export.success.title"),
        description: language.t("toast.session.export.success.description", { filename }),
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("toast.session.export.failed.title"),
        description: readableError(error),
      })
    } finally {
      exporting = false
      toaster.dismiss(notification)
    }
  }

  return (): ClientSlashCommand[] =>
    state.session
      ? [
          {
            id: "session.export",
            trigger: "export",
            title: language.t("command.session.export"),
            description: language.t("command.session.export.description"),
            onSelect: () => void exportSession(),
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
