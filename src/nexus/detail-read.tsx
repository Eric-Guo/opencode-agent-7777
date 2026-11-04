import { createEffect, onCleanup, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { request, type ChatController } from "./controller"
import { useLanguage } from "../runtime/i18n/language"
import { Button } from "@opencode/ui/button"

export function chatPath(chat: ChatController, action: string, query: Record<string, string> = {}) {
  return "/chats/" + encodeURIComponent(chat.s.id) + "/" + action + "?" + new URLSearchParams(query)
}

// Detail reads belong to their view, including variant and task. Never paint an earlier selection.
export function DetailRead<T>(p: {
  chat: ChatController
  path: string
  revision?: number
  children: (data: Accessor<T>) => JSX.Element
}) {
  const lang = useLanguage()
  const [s, set] = createStore({
    value: undefined as { path: string; scope: string; data: T } | undefined,
    error: "",
    retry: 0,
  })
  createEffect(() => {
    const path = p.path,
      scope = p.chat.s.connection?.scope
    void p.revision
    void s.retry
    const abort = new AbortController()
    onCleanup(() => abort.abort())
    if (!scope) return
    set("error", "")
    request<T>(path, scope, undefined, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) set("value", { path, scope, data })
      })
      .catch((e) => {
        if (!abort.signal.aborted) set("error", String(e.message || e))
      })
  })
  return (
    <>
      <Show when={s.error}>
        <p role="alert">
          {s.error} <Button onClick={() => set("retry", (n) => n + 1)}>{lang.t("review.retry")}</Button>
        </p>
      </Show>
      <Show
        when={s.value?.path === p.path && s.value.scope === p.chat.s.connection?.scope}
        fallback={!s.error && <span role="status">{lang.t("common.loading")}</span>}
      >
        {p.children(() => s.value!.data)}
      </Show>
    </>
  )
}
