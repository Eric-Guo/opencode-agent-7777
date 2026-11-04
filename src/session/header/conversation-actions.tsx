import { Show, createSignal } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import type { ChatController } from "@/nexus/controller"
import { Activity, Usage } from "@/nexus/activity"

export function ConversationActions(p: { chat: ChatController }) {
  const c = p.chat,
    lang = useLanguage(),
    dialog = useDialog()
  function open(kind: "activity" | "usage" | "actions") {
    const id = c.s.id,
      scope = c.s.connection?.scope,
      detail = c.s.snapshot.detail
    const version = detail?.version,
      original = detail?.title ?? ""
    dialog.show(() => {
      const [name, set] = createSignal(original)
      return (
        <Dialog size={kind === "activity" ? "large" : "normal"}>
          <DialogHeader>
            <DialogTitleGroup title={lang.t(`chat.${kind}`)} description={original || undefined} />
          </DialogHeader>
          <DialogBody>
            <Show when={c.s.id === id && c.s.connection?.scope === scope}>
              <Show when={kind === "usage"}>
                <Usage chat={c} />
              </Show>
              <Show when={kind === "activity"}>
                <Activity chat={c} />
              </Show>
              <Show when={kind === "actions"}>
                <form
                  class="chat-inspect"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (await c.command("rename", { title: name(), version })) dialog.close()
                  }}
                >
                  <label>
                    {lang.t("chat.title")}
                    <input
                      class="chat-field"
                      maxlength={512}
                      value={name()}
                      onInput={(e) => set(e.currentTarget.value)}
                    />
                  </label>
                  <div class="chat-row">
                    <Button type="submit" disabled={!name().trim() || name() === original || c.s.sending}>
                      {lang.t("chat.rename")}
                    </Button>
                    <Button
                      type="button"
                      disabled={c.s.sending}
                      onClick={async () => {
                        if (await c.command(c.s.snapshot.detail?.archived ? "restore" : "archive", {})) dialog.close()
                      }}
                    >
                      {lang.t(c.s.snapshot.detail?.archived ? "chat.restore" : "chat.archive")}
                    </Button>
                  </div>
                  <Show when={c.s.error}>
                    <p role="alert">{c.s.error}</p>
                  </Show>
                </form>
              </Show>
            </Show>
          </DialogBody>
        </Dialog>
      )
    })
  }
  return (
    <Show when={c.s.id && c.s.hydrated}>
      <Button onClick={() => open("activity")}>{lang.t("chat.activity")}</Button>
      <Button onClick={() => open("usage")}>{lang.t("chat.usage")}</Button>
      <Show when={c.s.snapshot.detail && !c.s.snapshot.detail.owned}>
        <Button onClick={() => open("actions")}>{lang.t("chat.actions")}</Button>
      </Show>
    </Show>
  )
}
