import type { SessionInfo } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextInput } from "@opencode/ui/text-input"
import { showToast } from "@opencode/ui/toast"
import { uuid } from "@opencode/util/uuid"
import { createSignal, onCleanup, Show } from "solid-js"
import { sessionRemoved } from "@/home/sessions/switcher-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { createLoadState, transitionLoad, type LoadEvent, type LoadState } from "@/runtime/server/load-machine"
import { currentDraft, currentRuntime, isCurrentDirectory, state } from "@/runtime/server/session-store-compact"
import { createSessionDeleteState, transitionSessionDelete, type SessionDeleteState } from "@/session/delete-machine"
import { sessionLabel } from "@/session/title"
import { readableError } from "@/shell/errors/readable"
import { createSessionRenamer } from "./rename-session"
import { confirmSessionWrite } from "./session-write-compact"

type Action = "rename" | "delete"

export function createSessionActions() {
  const language = useLanguage()
  const dialog = useDialog()
  const lifetime = new AbortController()
  const [write, setWrite] = createSignal<LoadState | SessionDeleteState>(createLoadState())
  const busy = () => write().status === "loading"

  const dispatch = (event: LoadEvent) =>
    setWrite((value) => ("sessionID" in value ? transitionSessionDelete(value, event) : transitionLoad(value, event)))
  onCleanup(() => {
    dispatch({ type: "disposed" })
    lifetime.abort()
  })

  function show(action: Action, session: SessionInfo) {
    const owner = currentRuntime() ?? currentDraft()
    const directory = session.location.directory
    const server = state.server
    const sameDirectory = () => state.server === server && isCurrentDirectory(directory)
    if (!owner || owner.signal.aborted || lifetime.signal.aborted || !sameDirectory() || busy()) return
    const id = session.id
    const name = sessionLabel(session)
    const layer = uuid()
    const close = () => dialog.close(layer)
    const signal = AbortSignal.any([owner.signal, lifetime.signal])
    signal.addEventListener("abort", close, { once: true })

    // A confirmed write belongs to this target even if navigation dismisses its dialog.
    const target = { api: owner.api, sessionID: id, lifetime: lifetime.signal, sameDirectory }
    const command =
      action === "rename"
        ? createSessionRenamer(target, session.title)
        : {
            save: () =>
              confirmSessionWrite(
                target,
                (event) => event.type === "session.deleted" && event.data.sessionID === id,
                (signal) => target.api.session.remove({ sessionID: id }, { signal }),
              ),
            apply: () => sessionRemoved(id),
          }
    const submit = async (title: string) => {
      if (signal.aborted || busy() || dialog.active?.id !== layer) return
      const pending = dispatch({ type: "started" })
      if (pending.status !== "loading") return
      const attempt = pending.attempt
      let outcome: LoadEvent
      try {
        await command.save(title)
        outcome = { type: "succeeded", attempt }
      } catch (error) {
        outcome = { type: "failed", attempt, error }
      }
      if (write() !== pending) return
      const result = dispatch(outcome)
      if (result.status === "failed" && !signal.aborted && dialog.active?.id !== layer) {
        showToast({
          variant: "error",
          title: language.t(action === "rename" ? "command.session.rename" : "command.session.delete"),
          description: readableError(result.error),
        })
      }
      if (result.status !== "ready") return
      close()
      if (sameDirectory()) command.apply(title)
    }
    setWrite(action === "delete" ? createSessionDeleteState(id) : createLoadState())
    void dialog.show(
      () => (
        <SessionActionDialog
          action={action}
          name={name}
          busy={busy()}
          error={writeError()}
          close={close}
          submit={submit}
        />
      ),
      () => signal.removeEventListener("abort", close),
      layer,
      signal,
    )
  }

  function writeError() {
    const value = write()
    return value.status === "failed" ? readableError(value.error) : undefined
  }

  return { show, busy, saved: () => write().status === "ready" }
}

function SessionActionDialog(props: {
  action: Action
  name: string
  busy: boolean
  error?: string
  close: () => void
  submit: (title: string) => Promise<void>
}) {
  const language = useLanguage()
  const [title, setTitle] = createSignal(props.name)
  const renaming = props.action === "rename"
  const label = () => language.t(renaming ? "command.session.rename" : "command.session.delete")
  const canSubmit = () => !props.busy && (!renaming || !!title().trim())
  return (
    <Dialog fit preventBackdropDismiss={props.busy}>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={label()}
          description={renaming ? undefined : language.t("session.delete.confirm", { name: props.name })}
        />
      </DialogHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!canSubmit()) return
          if (renaming && title().trim() === props.name) return props.close()
          void props.submit(title().trim())
        }}
      >
        <Show when={renaming}>
          <DialogBody>
            <TextInput
              appearance="large"
              class="!w-full"
              aria-label={label()}
              value={title()}
              disabled={props.busy}
              autofocus
              autocomplete="off"
              onFocus={(event) => event.currentTarget.select()}
              onInput={(event) => setTitle(event.currentTarget.value)}
            />
          </DialogBody>
        </Show>
        <Show when={props.error}>
          {(error) => (
            <p class="px-4 text-13-regular" role="alert">
              {error()}
            </p>
          )}
        </Show>
        <DialogFooter>
          <Button type="button" variant="ghost" autofocus={!renaming} disabled={props.busy} onClick={props.close}>
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
