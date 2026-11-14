import { abort } from "@opencode/util/abort"
import { showToast, toaster } from "@opencode/ui/toast"
import { batch, createSignal, onCleanup, untrack } from "solid-js"
import type { useLanguage } from "@/runtime/i18n/language"
import { currentSession, setState } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { downloadSessionExport, fetchSessionExport, sessionExportFilename } from "./export"
import {
  createSessionExportState,
  EXPORT_TIMEOUT_MS,
  selectSessionExporting,
  transitionSessionExport,
  type SessionExportEvent,
} from "./export-machine"

// One compact screen owns one export, even if its selected session changes meanwhile.
export function createSessionExporter(language: Pick<ReturnType<typeof useLanguage>, "t">) {
  const [state, setExportState] = createSignal(createSessionExportState())
  let finish: VoidFunction | undefined
  const dispatch = (event: SessionExportEvent) => {
    const previous = untrack(state)
    const next = transitionSessionExport(previous, event)
    if (next.state === previous) return false
    batch(() => {
      setExportState(next.state)
      if (selectSessionExporting(previous) && !selectSessionExporting(next.state)) {
        const complete = finish
        finish = undefined
        complete?.()
      }
      if (untrack(state) !== next.state) return
      for (const effect of next.effects) {
        if (effect.type === "save") {
          try {
            const filename = sessionExportFilename(effect.data.info)
            downloadSessionExport(filename, effect.data)
            dispatch({ type: "saved", attempt: effect.attempt, filename })
          } catch (error) {
            dispatch({ type: "failed", attempt: effect.attempt, error })
          }
        } else if (effect.type === "saved") {
          showToast({
            variant: "success",
            title: language.t("toast.session.export.success.title"),
            description: language.t("toast.session.export.success.description", { filename: effect.filename }),
          })
        } else {
          showToast({
            variant: "error",
            title: language.t("toast.session.export.failed.title"),
            description:
              effect.type === "timed-out" ? language.t("toast.session.export.timeout") : readableError(effect.error),
          })
        }
      }
    })
    return true
  }
  onCleanup(() => dispatch({ type: "disposed" }))

  return {
    exporting: () => selectSessionExporting(state()),
    export() {
      if (untrack(state).status !== "idle") return
      const active = currentSession()
      if (!active || !dispatch({ type: "requested", target: { sessionID: active.sessionID, api: active.client } }))
        return
      const current = untrack(state)
      if (current.status !== "fetching") return
      const { attempt, target } = current
      const controller = new AbortController()
      const done = Promise.withResolvers<void>()
      let notification: ReturnType<typeof showToast> | undefined
      const timer = setTimeout(() => dispatch({ type: "timed-out", attempt }), EXPORT_TIMEOUT_MS)
      finish = () => {
        clearTimeout(timer)
        abort(controller)
        if (notification !== undefined) toaster.dismiss(notification)
        done.resolve()
      }
      notification = showToast({
        variant: "loading",
        title: language.t("toast.session.export.loading"),
        persistent: true,
      })
      // Notification subscribers can dispose the owner before showToast returns its ID.
      if (untrack(state) !== current) {
        toaster.dismiss(notification)
        return done.promise
      }
      setState("error", "")
      if (untrack(state) !== current) return done.promise
      void Promise.try(() => fetchSessionExport({ ...target, signal: controller.signal })).then(
        (data) => dispatch({ type: "fetched", attempt, data }),
        (error: unknown) => dispatch({ type: "failed", attempt, error }),
      )
      return done.promise
    },
  }
}
