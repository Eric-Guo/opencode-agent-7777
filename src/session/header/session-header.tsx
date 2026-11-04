import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { HomeSessionsRegion } from "@/home/sessions/region"
import type { createChatController } from "@/nexus/controller"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionHeader(props: { chat: ReturnType<typeof createChatController>; dialogCount: number }) {
  const chat = props.chat
  const s = chat.s
  const language = useLanguage()
  return (
    <header
      data-slot="session-header"
      class="flex flex-wrap items-center justify-between gap-4 px-11 pb-4 pt-5 max-[720px]:px-[18px]"
    >
      <div>
        <h1 class="text-xl font-[720]">{s.connection?.agent || "rho"}</h1>
        <p class="text-xs text-v2-text-text-faint">
          {s.connection?.workspace}{" "}
          {language.t(
            s.connecting
              ? "session.status.starting"
              : !s.connection
                ? "session.status.offline"
                : s.sending
                  ? "session.status.sending"
                  : s.snapshot.busy
                    ? "session.status.working"
                    : "session.status.ready",
          )}
        </p>
      </div>
      <div class="flex gap-2 items-center text-xs">
        <span>{s.connection?.user}</span>
        <Icon name="speech-bubble" />
        <span>
          {props.dialogCount}/{HISTORY_DIALOG_LIMIT}
        </span>
        <Button
          disabled={!s.connection || s.sending}
          aria-label={language.t("session.new")}
          onClick={() => chat.select("")}
        >
          <Icon name="plus" />
        </Button>
        <HomeSessionsRegion chat={chat} />
        <Button onClick={() => language.setLocale(language.locale() === "en" ? "zh" : "en")}>
          {language.locale().toUpperCase()}
        </Button>
      </div>
    </header>
  )
}
