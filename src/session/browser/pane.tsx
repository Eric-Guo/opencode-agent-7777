import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { useDialog } from "@opencode/ui/context/dialog"
import { Loader } from "@opencode/ui/loader"
import { useLanguage } from "@/runtime/i18n/language"
import type { BrowserPaneAction, BrowserPaneAPI, BrowserPaneState } from "@/runtime/platform/browser-pane"

export function createSessionBrowser(api = window.nexusBrowser) {
  const [state, setState] = createSignal<BrowserPaneState>()
  const [open, setOpen] = createSignal(false)

  if (api) {
    onMount(() => {
      let revealed = 0
      const stop = api.subscribe((next) => {
        setState(next)
        if (next.reveal > revealed) setOpen(true)
        revealed = next.reveal
      })
      const wake = () => {
        if (!document.hidden && state()?.status === "disconnected") void api.refresh().catch(() => {})
      }

      void api.refresh().catch(() => {})
      document.addEventListener("visibilitychange", wake)
      window.addEventListener("focus", wake)
      onCleanup(() => {
        stop()
        document.removeEventListener("visibilitychange", wake)
        window.removeEventListener("focus", wake)
      })
    })
  }

  return {
    api,
    state,
    open,
    toggle() {
      if (!open() && state()?.status !== "ready") void api?.refresh().catch(() => {})
      setOpen(!open())
    },
  }
}

export function BrowserPane(props: { api: BrowserPaneAPI; state: BrowserPaneState | undefined; close(): void }) {
  const api = props.api
  const language = useLanguage()
  const dialog = useDialog()
  const selected = createMemo(() => props.state?.tabs.find((tab) => tab.id === props.state?.focusedTabID))
  const [address, setAddress] = createSignal("")
  const [error, setError] = createSignal(false)
  let surface!: HTMLDivElement

  createEffect(
    on([() => selected()?.id, () => selected()?.url], ([, url]) => {
      setAddress(url === "about:blank" ? "" : (url ?? ""))
      setError(false)
    }),
  )

  const hide = () => void api.layout(null).catch(() => {})
  const layout = () => {
    if (document.hidden || dialog.active || !surface?.isConnected || !selected() || props.state?.status !== "ready")
      return hide()

    const bounds = surface.getBoundingClientRect()
    void api.layout({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }).catch(() => {})
  }

  onMount(() => {
    const observer = new ResizeObserver(layout)
    observer.observe(surface)
    window.addEventListener("resize", layout)
    document.addEventListener("visibilitychange", layout)
    onCleanup(() => {
      observer.disconnect()
      window.removeEventListener("resize", layout)
      document.removeEventListener("visibilitychange", layout)
      hide()
    })
  })
  createEffect(layout)

  const command = (action: BrowserPaneAction) => {
    setError(false)
    void api.command(action).catch(() => setError(true))
  }
  const navigate = (event: SubmitEvent) => {
    event.preventDefault()
    const tab = selected()
    if (tab && address().trim()) command({ type: "navigate", tabID: tab.id, url: address() })
  }

  return (
    <aside
      id="nexus-browser-pane"
      aria-label={language.t("browser.title")}
      class="z-10 flex h-full w-[48%] min-w-0 shrink-0 flex-col border-l border-v2-border-border-base bg-v2-background-bg-deep max-[760px]:absolute max-[760px]:inset-y-0 max-[760px]:right-0 max-[760px]:w-full"
    >
      <div class="flex min-w-0 items-center gap-1 border-b border-v2-border-border-base p-2">
        <div class="flex min-w-0 flex-1 items-center gap-1 overflow-auto" aria-label={language.t("browser.tabs")}>
          <For each={props.state?.tabs}>
            {(tab) => (
              <div
                class="flex shrink-0 items-center rounded data-[selected=true]:bg-v2-background-bg-weak"
                data-selected={tab.id === selected()?.id}
              >
                <Button
                  class="max-w-44"
                  aria-pressed={tab.id === selected()?.id}
                  onClick={() => command({ type: "focus", tabID: tab.id })}
                >
                  <span class="truncate">
                    {tab.title || (tab.url === "about:blank" ? language.t("browser.newTab") : tab.url)}
                  </span>
                </Button>
                <Button
                  aria-label={language.t("browser.closeTab")}
                  onClick={() => command({ type: "close", tabID: tab.id })}
                >
                  <Icon name="close" />
                </Button>
              </div>
            )}
          </For>
        </div>
        <Button
          aria-label={language.t("browser.newTab")}
          disabled={props.state?.status !== "ready"}
          onClick={() => command({ type: "open" })}
        >
          <Icon name="plus" />
        </Button>
        <Button aria-label={language.t("browser.closePane")} onClick={props.close}>
          <Icon name="close" />
        </Button>
      </div>
      <Show when={selected()}>
        {(tab) => (
          <form class="flex min-w-0 items-center gap-1 border-b border-v2-border-border-base p-2" onSubmit={navigate}>
            <Button
              type="button"
              aria-label={language.t("browser.back")}
              disabled={!tab().canGoBack}
              onClick={() => command({ type: "back", tabID: tab().id })}
            >
              <Icon name="chevron-left" />
            </Button>
            <Button
              type="button"
              aria-label={language.t("browser.forward")}
              disabled={!tab().canGoForward}
              onClick={() => command({ type: "forward", tabID: tab().id })}
            >
              <Icon name="chevron-right" />
            </Button>
            <Button
              type="button"
              aria-label={language.t("browser.reload")}
              onClick={() => command({ type: "reload", tabID: tab().id })}
            >
              <Show when={!tab().loading} fallback={<Loader />}>
                <Icon name="refresh" />
              </Show>
            </Button>
            <input
              class="min-w-0 flex-1 rounded border border-v2-border-border-base bg-transparent px-2 py-1"
              aria-label={language.t("browser.address")}
              placeholder={language.t("browser.address")}
              value={address()}
              onInput={(event) => setAddress(event.currentTarget.value)}
            />
          </form>
        )}
      </Show>
      <Show when={error() || selected()?.loadError}>
        <p class="px-3 py-2 text-sm" role="alert">
          {language.t("browser.actionFailed")}
        </p>
      </Show>
      <div ref={surface} class="relative flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm">
        <Show when={props.state?.status === "ready" && !selected()}>
          <Button onClick={() => command({ type: "open" })}>{language.t("browser.newTab")}</Button>
        </Show>
        <Show when={!props.state || props.state.status === "connecting"}>
          <Loader />
        </Show>
        <Show
          when={
            props.state?.status === "inactive" ||
            props.state?.status === "disconnected" ||
            props.state?.status === "replaced" ||
            props.state?.status === "restart"
          }
        >
          <div class="flex flex-col items-center gap-2">
            <p>
              {language.t(
                props.state?.status === "inactive"
                  ? "browser.setup"
                  : props.state?.status === "replaced"
                    ? "browser.replaced"
                    : props.state?.status === "restart"
                      ? "browser.restart"
                      : "browser.disconnected",
              )}
            </p>
            <Button onClick={() => void api.refresh().catch(() => {})}>{language.t("browser.retry")}</Button>
          </div>
        </Show>
      </div>
    </aside>
  )
}
