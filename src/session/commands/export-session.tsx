import { showToast, toaster } from "@opencode/ui/toast"
import { createEffect, createSignal, on, onCleanup, onMount, type Accessor } from "solid-js"
import { CONVERSATION_EXPORT_END, conversationExportFilename } from "@/nexus/chat"
import { useLanguage } from "@/runtime/i18n/language"
import { readableError } from "@/shell/errors/readable"

type Target = { id: string; scope: string }
type ExportAttempt = { target: Target; controller: AbortController; notice?: number }

export function createSessionExporter(target: Accessor<Target | undefined>) {
  const language = useLanguage()
  const [active, setActive] = createSignal<ExportAttempt>()

  function finish(attempt: ExportAttempt) {
    setActive(undefined)
    attempt.controller.abort()
    if (attempt.notice !== undefined) toaster.dismiss(attempt.notice)
  }

  createEffect(
    on(target, (current) => {
      const attempt = active()
      if (attempt && attempt.target !== current) finish(attempt)
    }),
  )
  function cancel() {
    const attempt = active()
    if (attempt) finish(attempt)
  }

  onMount(() => window.addEventListener("pagehide", cancel))
  onCleanup(() => {
    window.removeEventListener("pagehide", cancel)
    cancel()
  })

  async function run() {
    const current = target()
    if (!current || active()) return

    const controller = new AbortController()
    const attempt: ExportAttempt = { target: current, controller }
    const timeout = AbortSignal.timeout(60_000)
    const signal = AbortSignal.any([controller.signal, timeout])
    const ownsExport = () => active() === attempt && target() === current
    setActive(attempt)
    attempt.notice = showToast({
      variant: "loading",
      title: language.t("toast.session.export.loading"),
      persistent: true,
    })
    if (active() !== attempt) {
      if (attempt.notice !== undefined) toaster.dismiss(attempt.notice)
      return
    }

    try {
      const response = await fetch(`/api/7777/chats/${encodeURIComponent(current.id)}/export`, {
        headers: { "x-7777-scope": encodeURIComponent(current.scope) },
        signal,
      })
      if (response.status === 504) throw timeoutError()
      if (!response.ok) throw new Error((await response.json().catch(() => undefined))?.error || response.statusText)
      if (response.headers.get("content-type")?.split(";")[0] !== "application/json")
        throw new Error(language.t("toast.session.export.invalid"))

      const file = await response.blob()
      const end = await file.slice(-CONVERSATION_EXPORT_END.length).text()
      if (!ownsExport()) return
      signal.throwIfAborted()
      if (end !== CONVERSATION_EXPORT_END) throw new Error(language.t("toast.session.export.invalid"))

      const filename = conversationExportFilename(current.id)
      const url = URL.createObjectURL(file)
      const link = document.createElement("a")
      try {
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      showToast({
        variant: "success",
        title: language.t("toast.session.export.success.title"),
        description: language.t("toast.session.export.success.description", { filename }),
      })
    } catch (error) {
      if (ownsExport())
        showToast({
          variant: "error",
          title: language.t("toast.session.export.failed.title"),
          description: readableError(timeout.aborted ? timeoutError() : error),
        })
    } finally {
      if (active() === attempt) finish(attempt)
    }
  }

  const timeoutError = () => new Error(language.t("toast.session.export.timeout"))
  return { available: () => !!target(), running: () => !!active(), run }
}
