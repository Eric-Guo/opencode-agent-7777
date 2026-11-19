import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { createEffect, createSignal, onCleanup, Show, type ParentProps } from "solid-js"
import type { ConversationAction, ConversationOptions, ConversationTarget } from "@/nexus/chat"
import { request } from "@/nexus/controller"
import { useLanguage } from "@/runtime/i18n/language"
import type { createSessionExporter } from "@/session/commands/export-session"
import type { createSessionActions } from "@/session/commands/session-actions"

export function SessionOptions(
  props: ParentProps<{
    target: ConversationTarget
    title: string
    archived?: boolean
    detail?: ConversationOptions
    loadDetail?: boolean
    busy: boolean
    exporter: ReturnType<typeof createSessionExporter>
    actions: ReturnType<typeof createSessionActions>
    onSelect?: () => void
  }>,
) {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const [loaded, setLoaded] = createSignal<ConversationOptions>()
  const [failed, setFailed] = createSignal(false)
  const options = () => (props.loadDetail ? loaded() : props.detail)
  const archived = () => options()?.archived ?? props.archived
  const canEdit = () => {
    const detail = options()
    return !props.busy && !!detail && !detail.owned && detail.writable !== false
  }
  let trigger!: HTMLButtonElement

  createEffect(() => {
    setLoaded(undefined)
    setFailed(false)
    if (!props.loadDetail || !open()) return
    const { id, scope } = props.target
    const controller = new AbortController()
    const signal = controller.signal
    onCleanup(() => controller.abort())
    void request<ConversationOptions>(
      `/chats/${encodeURIComponent(id)}/options`,
      scope,
      undefined,
      AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    ).then(
      (detail) => {
        if (!signal.aborted) setLoaded(detail)
      },
      () => {
        if (!signal.aborted) setFailed(true)
      },
    )
  })

  function select(action: ConversationAction | "export") {
    const target = props.target
    const detail = options()
    const name = detail?.title || props.title
    if (action === "export" ? props.exporter.running() : !canEdit()) return
    if (props.onSelect) props.onSelect()
    else trigger.focus({ preventScroll: true })
    if (action === "export") void props.exporter.run(target)
    else if (detail) props.actions.show(action, target, detail, name)
  }

  return (
    <Menu gutter={4} placement="bottom-end" modal={false} open={open()} onOpenChange={setOpen}>
      <div
        class="flex min-w-0 items-center gap-1"
        onContextMenu={(event) => {
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
          aria-label={language.t("session.options", { name: props.title })}
        />
      </div>
      <Menu.Portal mount={trigger?.closest<HTMLElement>('[data-component="popover-content"]') ?? undefined}>
        <Menu.Content data-owns-escape>
          <Menu.Group>
            <Menu.GroupLabel class="max-w-52 truncate">{props.title}</Menu.GroupLabel>
            <Menu.Item disabled={!canEdit()} onSelect={() => select("rename")}>
              {language.t("command.session.rename")}
            </Menu.Item>
            <Menu.Item disabled={props.exporter.running()} onSelect={() => select("export")}>
              {language.t("command.session.export")}
            </Menu.Item>
            <Menu.Item disabled={!canEdit()} onSelect={() => select(archived() ? "restore" : "archive")}>
              {language.t(archived() ? "chat.restore" : "chat.archive")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item disabled={!canEdit()} onSelect={() => select("delete")}>
              {language.t("command.session.delete")}…
            </Menu.Item>
            <Show when={failed()}>
              <Menu.GroupLabel role="status">{language.t("session.options.loadFailed")}</Menu.GroupLabel>
            </Show>
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
