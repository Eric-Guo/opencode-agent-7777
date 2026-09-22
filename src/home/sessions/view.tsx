import { Icon } from "@opencode/ui/icon"
import { createMemo, createUniqueId, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { groupSessions, type HomeSessionsController } from "./controller"
import { recentSessionDescription, recentSessionTitle } from "./recent-compact"
import type { HomeSessionSearchController } from "./search"

export function HomeSessionsView(props: {
  sessions: HomeSessionsController
  search: HomeSessionSearchController
  onClose: () => void
}) {
  const language = useLanguage()
  const listID = createUniqueId()
  const optionID = (id: string) => `${listID}-${id}`
  const groups = createMemo(() => groupSessions(props.search.result.list()))
  const active = createMemo(props.search.result.active)
  const searching = () => props.search.query.value().trim().length > 0
  const labels = {
    today: "home.sessions.group.today",
    yesterday: "home.sessions.group.yesterday",
    older: "home.sessions.group.older",
  } as const
  let input!: HTMLInputElement
  let list!: HTMLDivElement
  onMount(() => {
    // The popover defers its own autofocus; place the search caret after it settles.
    let frame: number | undefined
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => input.focus())
    })
    onCleanup(() => {
      clearTimeout(timer)
      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  })
  const move = (delta: number) => {
    props.search.result.move(delta)
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
  }
  const loadMore = async () => {
    await props.sessions.data.more()
    // Disabling the focused loading button can return focus to the body.
    if (input.isConnected && document.activeElement === document.body) input.focus()
  }

  return (
    <div data-component="home-sessions">
      <div class="flex h-8 items-center gap-2 rounded-md border border-v2-border-border-base px-2">
        <Icon name="magnifying-glass" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label={language.t("home.sessions.search.placeholder")}
          aria-controls={listID}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={active() ? optionID(active()!) : undefined}
          value={props.search.query.value()}
          placeholder={language.t("home.sessions.search.placeholder")}
          autocomplete="off"
          spellcheck={false}
          class="min-w-0 flex-1 bg-transparent text-[13px] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
          onInput={(event) => props.search.query.input(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              move(event.key === "ArrowDown" ? 1 : -1)
            }
            if (event.key === "Enter") {
              event.preventDefault()
              if (!event.repeat && props.search.result.selectActive()) props.onClose()
            }
          }}
        />
        <Show when={props.search.query.value()}>
          <button
            type="button"
            aria-label={language.t("common.clear")}
            class="grid size-5 shrink-0 place-items-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
            onClick={() => {
              props.search.query.input("")
              input.focus()
            }}
          >
            <Icon name="close" size="small" />
          </button>
        </Show>
      </div>
      <div
        ref={list}
        id={listID}
        role="listbox"
        aria-label={language.t("session.recent")}
        aria-busy={props.sessions.data.loading() || props.sessions.session.switching()}
        class="mt-2 max-h-[min(360px,50vh)] overflow-y-auto"
      >
        <For each={groups()}>
          {(group) => (
            <div role="group" aria-label={language.t(labels[group.id])}>
              <div class="px-2 py-1 text-xs leading-5 text-v2-text-text-muted">{language.t(labels[group.id])}</div>
              <For each={group.sessions}>
                {(session) => {
                  const id = session.id
                  return (
                    <button
                      id={optionID(id)}
                      type="button"
                      role="option"
                      aria-selected={active() === id}
                      disabled={props.sessions.session.switching()}
                      tabIndex={-1}
                      class="block w-full rounded-md px-2 py-1.5 text-start text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline disabled:opacity-55"
                      classList={{
                        "bg-v2-overlay-simple-overlay-hover": active() === id,
                      }}
                      onMouseEnter={() => props.search.result.highlight(id)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (props.sessions.session.open(session)) props.onClose()
                      }}
                    >
                      <span dir="auto" class="block truncate">
                        {recentSessionTitle(session)}
                      </span>
                      <span class="block truncate text-xs leading-5 text-v2-text-text-muted">
                        {recentSessionDescription(session, language.intl())}
                      </span>
                    </button>
                  )
                }}
              </For>
            </div>
          )}
        </For>
      </div>
      <Show when={props.sessions.data.failed()}>
        <div role="alert" class="px-2 py-2 text-[13px] leading-5 text-v2-text-text-muted">
          {language.t("home.sessions.loadFailed")}
          <button type="button" class="ml-2 underline" onClick={() => void loadMore()}>
            {language.t("home.sessions.retry")}
          </button>
        </div>
      </Show>
      <Show when={!props.sessions.data.failed() && (props.sessions.data.hasMore() || props.sessions.data.loading())}>
        <button
          type="button"
          class="mt-2 w-full rounded-md px-2 py-2 text-[13px] leading-5 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-55"
          disabled={props.sessions.data.loading()}
          onClick={() => void loadMore()}
        >
          {props.sessions.data.loading() ? language.t("common.loading") : language.t("home.sessions.loadMore")}
        </button>
      </Show>
      <Show when={groups().length === 0 && !props.sessions.data.loading() && !props.sessions.data.failed()}>
        <p role="status" class="px-2 py-3 text-[13px] leading-5 text-v2-text-text-muted">
          {searching()
            ? language.t("home.sessions.search.noResults", { query: props.search.query.value().trim() })
            : language.t("session.recent.empty")}
        </p>
      </Show>
    </div>
  )
}
