import type { SessionInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { createSignal, type ParentProps } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { currentDirectory, currentDraft, currentRuntime } from "@/runtime/server/session-store-compact"
import { useSessionCommands } from "@/session/commands/use-session-commands"
import { sessionLabel } from "@/session/title"

export function SessionOptions(
  props: ParentProps<{ session: SessionInfo; onSelect?: () => void; disabled?: boolean }>,
) {
  const language = useLanguage()
  const { actions, exporter } = useSessionCommands()
  const [open, setOpen] = createSignal(false)
  let trigger!: HTMLButtonElement
  const select = (action: "rename" | "delete" | "export") => {
    const session = props.session
    const owner = currentRuntime() ?? currentDraft()
    if (!owner || owner.signal.aborted || session.location.directory !== currentDirectory()) return
    // Capture the row before its picker clears its query and unmounts.
    if (props.onSelect) props.onSelect()
    else trigger.focus({ preventScroll: true })
    if (action === "export") void exporter.export({ sessionID: session.id, api: owner.api })
    else actions.show(action, session)
  }
  return (
    <Menu gutter={4} placement="bottom-end" modal={false} open={open()} onOpenChange={setOpen}>
      <div
        class="flex min-w-0 items-center gap-1"
        onContextMenu={(event) => {
          if (props.disabled) return
          event.preventDefault()
          setOpen(true)
        }}
      >
        {props.children}
        <Menu.Trigger
          as={IconButton}
          ref={trigger}
          icon={<Icon name="outline-dots" />}
          variant="ghost-muted"
          size="small"
          disabled={props.disabled}
          aria-label={language.t("session.options", { name: sessionLabel(props.session) })}
        />
      </div>
      <Menu.Portal mount={trigger?.closest<HTMLElement>('[data-component="popover-content"]') ?? undefined}>
        <Menu.Content data-owns-escape>
          <Menu.Group>
            <Menu.GroupLabel class="max-w-52 truncate">{sessionLabel(props.session)}</Menu.GroupLabel>
            <Menu.Item disabled={actions.busy()} onSelect={() => select("rename")}>
              {language.t("command.session.rename")}
            </Menu.Item>
            <Menu.Item disabled={exporter.exporting()} onSelect={() => select("export")}>
              {language.t("command.session.export")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item disabled={actions.busy()} onSelect={() => select("delete")}>
              {language.t("command.session.delete")}…
            </Menu.Item>
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
