import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextInput } from "@opencode/ui/text-input"
import { showToast } from "@opencode/ui/toast"
import { uuid } from "@opencode/util/uuid"
import { createEffect, createSignal, Show } from "solid-js"
import type { ConversationAction, ConversationOptions, ConversationTarget } from "@/nexus/chat"
import type { ChatController } from "@/nexus/controller"
import { useLanguage } from "@/runtime/i18n/language"
import { readableError } from "@/shell/errors/readable"

export function createSessionActions(chat: ChatController) {
  const language = useLanguage()
  const dialog = useDialog()

  function show(action: ConversationAction, target: ConversationTarget, options: ConversationOptions, name: string) {
    const selected = chat.s.id
    const sameSelection = () => chat.s.connection?.scope === target.scope && chat.s.id === selected
    const canEdit = () => sameSelection() && !chat.s.sending && (target.id !== selected || chat.manageable())
    if (!canEdit() || options.owned || options.writable === false) return

    if (action === "archive" || action === "restore") {
      void chat.manageSession(target, action).catch((error: unknown) => {
        if (sameSelection())
          showToast({ variant: "error", title: language.t(`chat.${action}`), description: readableError(error) })
      })
      return
    }

    const layer = uuid()
    const close = () => dialog.close(layer)
    void dialog.show(
      () => (
        <SessionActionDialog
          action={action}
          name={name}
          title={options.title}
          sameSelection={sameSelection()}
          canEdit={canEdit()}
          close={close}
          reportError={(error) => {
            if (dialog.active?.id === layer) return readableError(error)
            if (sameSelection())
              showToast({
                variant: "error",
                title: language.t(`command.session.${action}`),
                description: readableError(error),
              })
          }}
          submit={(title) =>
            chat.manageSession(target, action, action === "rename" ? { title, version: options.version } : {})
          }
        />
      ),
      undefined,
      layer,
    )
  }

  return { show }
}

function SessionActionDialog(props: {
  action: "rename" | "delete"
  name: string
  title: string
  sameSelection: boolean
  canEdit: boolean
  close: () => void
  submit: (title: string) => Promise<boolean>
  reportError: (error: unknown) => string | undefined
}) {
  const language = useLanguage()
  const [title, setTitle] = createSignal(props.title)
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const renaming = props.action === "rename"
  const label = () => language.t(`command.session.${props.action}`)
  const canSubmit = () => props.canEdit && !pending() && (!renaming || !!title().trim())

  createEffect(() => {
    if (!props.sameSelection) props.close()
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!canSubmit()) return
    const name = title().trim()
    if (renaming && name === props.title) return props.close()
    setPending(true)
    setError(undefined)
    try {
      if (await props.submit(name)) props.close()
    } catch (error) {
      setError(props.reportError(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog fit preventBackdropDismiss={pending()}>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={label()}
          description={renaming ? undefined : language.t("session.delete.confirm", { name: props.name })}
        />
      </DialogHeader>
      <form class="contents" onSubmit={submit}>
        <Show when={renaming}>
          <DialogBody class="px-4">
            <TextInput
              appearance="large"
              class="!w-full"
              aria-label={label()}
              value={title()}
              disabled={!props.canEdit || pending()}
              maxlength={512}
              autofocus
              autocomplete="off"
              onFocus={(event) => event.currentTarget.select()}
              onInput={(event) => setTitle(event.currentTarget.value)}
            />
          </DialogBody>
        </Show>
        <Show when={error()}>
          {(error) => (
            <p class="px-4 text-13-regular" role="alert">
              {error()}
            </p>
          )}
        </Show>
        <DialogFooter>
          <Button type="button" variant="ghost" autofocus={!renaming} disabled={pending()} onClick={props.close}>
            {language.t("ui.common.cancel")}
          </Button>
          <Button type="submit" variant={renaming ? "contrast" : "danger"} disabled={!canSubmit()}>
            {renaming ? language.t("common.save") : label()}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
