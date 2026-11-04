import { Icon } from "@opencode/ui/icon"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { HomeSessionsController } from "./controller"
import { groupSessions, recentSessionDescription, recentSessionTitle } from "./records"
import type { HomeSessionSearchController } from "./search"

export function HomeSessionsView(props: {
  sessions: HomeSessionsController
  search: HomeSessionSearchController
  fallbackTitle: string
}) {
  const language = useLanguage()
  const navigation = props.search.result
  const groups = createMemo(() => groupSessions(props.search.result.list()))
  const active = () => navigation.activeItem()?.id
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
  const loadMore = async () => {
    await props.sessions.data.more()
    // Disabling the focused loading button can return focus to the body.
    if (input.isConnected && document.activeElement === document.body) input.focus()
  }

  return (
    <div data-component="home-sessions">
      <TextInput
        ref={input}
        type="text"
        role="combobox"
        aria-label={language.t("home.sessions.search.placeholder")}
        aria-controls={navigation.listID}
        aria-expanded="true"
        aria-autocomplete="list"
        aria-activedescendant={navigation.activeID()}
        value={props.search.query.value()}
        placeholder={language.t("home.sessions.search.placeholder")}
        autocomplete="off"
        spellcheck={false}
        class="w-full"
        appearance="large"
        leadingIcon={<Icon name="magnifying-glass" size="small" />}
        showClearButton={!!props.search.query.value()}
        clearIcon="close"
        clearLabel={language.t("common.clear")}
        onClearClick={() => {
          props.search.query.input("")
          input.focus()
        }}
        onInput={(event) => props.search.query.input(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
          if (event.key === "Enter" && event.repeat) {
            event.preventDefault()
            return
          }
          navigation.onKeyDown(event)
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
          }
        }}
      />
      <MenuScroll
        viewportRef={(element) => (list = element)}
        id={navigation.listID}
        role="listbox"
        tabIndex={0}
        aria-label={language.t("session.recent")}
        aria-busy={props.sessions.data.loading() || props.sessions.session.switching()}
        class="mt-2 max-h-[min(360px,50vh)]"
        viewportClass="outline-none"
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
                      id={navigation.optionID(session)}
                      type="button"
                      role="option"
                      aria-selected={active() === id}
                      disabled={props.sessions.session.switching()}
                      tabIndex={-1}
                      class="block w-full rounded-md px-2 py-1.5 text-start text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline disabled:opacity-55"
                      classList={{
                        "bg-v2-overlay-simple-overlay-hover": active() === id,
                      }}
                      onMouseEnter={() => navigation.setActive(id)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => navigation.select(session)}
                    >
                      <span dir="auto" class="block truncate">
                        {recentSessionTitle(session, props.fallbackTitle)}
                      </span>
                      <span class="block truncate text-xs leading-5 text-v2-text-text-muted">
                        {session.attention
                          ? language.t("chat.attention") + " · "
                          : session.working
                            ? language.t("session.status.working") + " · "
                            : ""}
                        {recentSessionDescription(session, language.intl())}
                      </span>
                    </button>
                  )
                }}
              </For>
            </div>
          )}
        </For>
      </MenuScroll>
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
