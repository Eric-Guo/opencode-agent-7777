import { Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import type { ChatController } from "@/nexus/controller"
import { MemoryBindings } from "@/nexus/memory-bindings"
import { Activity, Usage } from "@/nexus/activity"

export function ConversationActions(p: { chat: ChatController }) {
  const c = p.chat,
    lang = useLanguage(),
    dialog = useDialog()

  function open(kind: "activity" | "usage" | "memory") {
    const id = c.s.id,
      scope = c.s.connection?.scope,
      title = c.s.snapshot.detail?.title
    dialog.show(() => {
      return (
        <Dialog size={kind === "activity" ? "large" : "normal"}>
          <DialogHeader>
            <DialogTitleGroup
              title={kind === "memory" ? "Memory bindings" : lang.t(`chat.${kind}`)}
              description={title || undefined}
            />
          </DialogHeader>
          <DialogBody>
            <Show when={c.s.id === id && c.s.connection?.scope === scope}>
              <Show when={kind === "memory"}>
                <MemoryBindings chat={c} saved={() => dialog.close()} />
              </Show>
              <Show when={kind === "usage"}>
                <Usage chat={c} />
              </Show>
              <Show when={kind === "activity"}>
                <Activity chat={c} />
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
      <Button onClick={() => open("memory")}>Memory bindings</Button>
    </Show>
  )
}
