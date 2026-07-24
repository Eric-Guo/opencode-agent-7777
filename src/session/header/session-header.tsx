import { Icon } from "@opencode-ai/ui/icon"
import { createResource, For, Show } from "solid-js"
import { Menu } from "@opencode-ai/ui/menu"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { useLanguage, type Locale } from "@/runtime/i18n/language"
import { getDesktopCybrosCurrentUser, windowsElectron } from "@/runtime/platform/platform-bridge"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { openRecentSession } from "@/home/sessions/switcher-compact"
import { recentSessionDescription, recentSessionTitle } from "@/home/sessions/recent-compact"

const CYBROS_CURRENT_USER_URL = "https://cybros.thape.com.cn/api/sigma_agents/me.json"

type CybrosCurrentUser = {
  chinese_name: string
  clerk_code: string
}

function nextLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en"
}

async function fetchCybrosCurrentUser(ssoJwtSecretKey: string) {
  const desktopUser = getDesktopCybrosCurrentUser()
  if (desktopUser) return desktopUser

  const response = await fetch(CYBROS_CURRENT_USER_URL, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${ssoJwtSecretKey}`,
    },
  })
  if (!response.ok) throw new Error(`Failed to load Cybros user: ${response.status}`)

  return response.json() as Promise<CybrosCurrentUser>
}

export function SessionHeader(props: {
  status: string
  userDialogCount: number
  showReasoningSummaries: boolean
  newSessionPending: boolean
  newSessionDisabled: boolean
  onToggleReasoningSummaries: () => void
  onNewSession: () => void
}) {
  const language = useLanguage()
  const targetLocale = () => nextLocale(language.locale())
  const [cybrosCurrentUser] = createResource(
    () => state.server?.ssoJwtSecretKey,
    fetchCybrosCurrentUser,
  )

  return (
    <header
      data-slot="session-header"
      class="flex min-w-0 items-center justify-between gap-4 bg-v2-background-bg-deep px-11 pb-4 pt-5 [-webkit-app-region:drag] select-none max-[720px]:px-[18px] max-[720px]:pb-3 max-[720px]:pt-[18px]"
    >
      <div>
        <h1 class="m-0 text-xl font-[720] leading-[1.1] tracking-[0] text-v2-text-text-base">{currentLocalAgent()}</h1>
        <p class="m-0 mt-1 text-xs leading-[1.2] text-v2-text-text-faint">{props.status}</p>
      </div>
      <div
        data-slot="session-header-controls"
        class="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag] mt-5"
        classList={{ "mr-[138px]": windowsElectron }}
      >
        <Show when={cybrosCurrentUser()}>
          {(user) => (
            <div class="inline-flex h-[30px] items-center justify-center px-2 text-xs font-[650] text-v2-text-text-muted select-none">
              {user().chinese_name} ({user().clerk_code})
            </div>
          )}
        </Show>
        <div class="inline-flex h-[30px] min-w-[30px] items-center justify-center gap-1 px-2 text-xs font-[650] text-v2-text-text-muted select-none [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5">
          <Icon name="speech-bubble" />
          <span>{props.userDialogCount}</span>
          <span>/</span>
          <span>{HISTORY_DIALOG_LIMIT}</span>
        </div>
        <button
          type="button"
          class="inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-xs font-[650] text-v2-text-text-muted hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base disabled:opacity-55 [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5"
          aria-label={language.t("session.new")}
          title={language.t("session.new")}
          disabled={props.newSessionPending || props.newSessionDisabled}
          onClick={props.onNewSession}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          data-slot="session-header-mode-toggle"
          class="inline-flex h-[30px] min-w-[92px] items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-[650] hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base max-[720px]:min-w-[30px] max-[720px]:px-2 [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5"
          classList={{
            "border-v2-border-border-strong bg-v2-overlay-simple-overlay-hover text-v2-text-text-base":
              props.showReasoningSummaries,
            "border-v2-border-border-base bg-v2-background-bg-layer-01 text-v2-text-text-muted":
              !props.showReasoningSummaries,
          }}
          aria-label={language.t("session.thinking.toggle")}
          aria-pressed={props.showReasoningSummaries}
          title={language.t("session.thinking.toggle")}
          onClick={props.onToggleReasoningSummaries}
        >
          <Icon name="brain" />
          <span data-slot="session-header-control-label" class="max-[720px]:hidden">
            {language.t("session.thinking")}
          </span>
        </button>
        <Menu gutter={4} placement="bottom-end" modal={false}>
          <Menu.Trigger
            class="inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-xs font-[650] text-v2-text-text-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-55 data-[expanded]:border-v2-border-border-strong data-[expanded]:bg-v2-overlay-simple-overlay-hover [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5"
            aria-label={language.t("session.recent")}
            title={language.t("session.recent")}
            disabled={state.recentSessionsLoading && state.recentSessions.length === 0}
          >
            <Icon name="bullet-list" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content class="w-[276px] [&_[data-component=menu-v2-item]]:min-h-[42px] [&_[data-component=menu-v2-item]]:items-start [&_[data-component=menu-v2-item]]:gap-2 [&_[data-component=menu-v2-item]]:px-2 [&_[data-component=menu-v2-item]]:py-1.5">
              <Menu.Group>
                <Menu.GroupLabel>{language.t("session.recent")}</Menu.GroupLabel>
                <Show
                  when={state.recentSessions.length > 0}
                  fallback={
                    <Menu.Item disabled>{language.t("session.recent.empty")}</Menu.Item>
                  }
                >
                  <For each={state.recentSessions}>
                    {(session, index) => (
                      <Menu.Item
                        disabled={!!state.recentSessionSwitchingID}
                        onSelect={() => void openRecentSession(session)}
                      >
                        <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-v2-border-border-muted bg-v2-background-bg-layer-02 text-[11px] font-[650] leading-none text-v2-text-text-muted">
                          {index() + 1}
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                            {recentSessionTitle(session)}
                          </span>
                          <span class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                            {recentSessionDescription(session)}
                          </span>
                        </span>
                      </Menu.Item>
                    )}
                  </For>
                </Show>
              </Menu.Group>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
        <button
          type="button"
          class="inline-flex h-[30px] min-w-[48px] items-center justify-center gap-1.5 rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-xs font-[650] text-v2-text-text-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base max-[720px]:px-2 [&_[data-component=icon]]:h-3.5 [&_[data-component=icon]]:w-3.5"
          aria-label={language.t("language.switch", { language: language.label(targetLocale()) })}
          onClick={() => language.setLocale(targetLocale())}
        >
          {language.locale().toUpperCase()}
        </button>
      </div>
    </header>
  )
}
