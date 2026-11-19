import { showToast, toaster } from "@opencode/ui/toast"
import { createEffect, createSignal, on, onCleanup, onMount, type Accessor } from "solid-js"
import { CONVERSATION_EXPORT_END, conversationExportFilename, type ConversationTarget } from "@/nexus/chat"
import { useLanguage } from "@/runtime/i18n/language"
import { readableError } from "@/shell/errors/readable"

type ExportAttempt = { owner: ConversationTarget; id: string; controller: AbortController; notice?: number }

export function createSessionExporter(owner: Accessor<ConversationTarget | undefined>, canExportActive: Accessor<boolean>) {
  const language = useLanguage()
  const [active, setActive] = createSignal<ExportAttempt>()
  const valid = (current: ConversationTarget, id: string) =>
    owner() === current && (id !== current.id || canExportActive())

  function finish(attempt: ExportAttempt) {
    setActive(undefined)
    attempt.controller.abort()
    if (attempt.notice !== undefined) toaster.dismiss(attempt.notice)
  }

  createEffect(
    on([owner, canExportActive], () => {
      const attempt = active()
      if (attempt && !valid(attempt.owner, attempt.id)) finish(attempt)
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

  async function run(target?: ConversationTarget) {
    const current = owner()
    const id = target?.id ?? current?.id
    if (!current || !id || (target && target.scope !== current.scope) || !valid(current, id) || active()) return

    const controller = new AbortController()
    const attempt: ExportAttempt = { owner: current, id, controller }
    const timeout = AbortSignal.timeout(60_000)
    const signal = AbortSignal.any([controller.signal, timeout])
    const ownsExport = () => active() === attempt && valid(current, id)
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
      const response = await fetch(`/api/7777/chats/${encodeURIComponent(id)}/export`, {
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

      const filename = conversationExportFilename(id)
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
  return { available: () => !!owner()?.id && canExportActive(), running: () => !!active(), run }
}
