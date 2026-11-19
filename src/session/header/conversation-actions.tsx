import { Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import type { ChatController } from "@/nexus/controller"
import { MemoryBindings } from "@/nexus/memory-bindings"

export function ConversationActions(p: { chat: ChatController }) {
  const c = p.chat
  const dialog = useDialog()

  function openMemory() {
    const id = c.s.id,
      scope = c.s.connection?.scope,
      title = c.s.snapshot.detail?.title
    dialog.show(() => {
      return (
        <Dialog>
          <DialogHeader>
            <DialogTitleGroup title="Memory bindings" description={title || undefined} />
          </DialogHeader>
          <DialogBody>
            <Show when={c.s.id === id && c.s.connection?.scope === scope}>
              <MemoryBindings chat={c} saved={() => dialog.close()} />
            </Show>
          </DialogBody>
        </Dialog>
      )
    })
  }
  return (
    <Show when={c.s.id && c.s.hydrated}>
      <Button onClick={openMemory}>Memory bindings</Button>
    </Show>
  )
}
