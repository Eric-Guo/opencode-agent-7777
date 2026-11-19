import type { OpenCodeClient, SessionInfo } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextInput } from "@opencode/ui/text-input"
import { showToast } from "@opencode/ui/toast"
import { uuid } from "@opencode/util/uuid"
import { createSignal, onCleanup, Show } from "solid-js"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { sessionRemoved } from "@/home/sessions/switcher-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { isSessionNotFoundError } from "@/runtime/server/errors"
import { createLoadState, transitionLoad } from "@/runtime/server/load-machine"
import { bounded } from "@/runtime/server/operation"
import { currentDirectory, currentDraft, currentRuntime, state } from "@/runtime/server/session-store-compact"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { sessionLabel } from "@/session/title"
import { readableError } from "@/shell/errors/readable"

type Action = "rename" | "delete"

// Server events may acknowledge the write before its HTTP response, including a delete that navigates the view.
async function saveSessionAction(
  api: OpenCodeClient,
  id: string,
  action: Action,
  title: string,
  lifetime: AbortSignal,
  sameDirectory: () => boolean,
) {
  const confirmed = Promise.withResolvers<void>()
  const request = new AbortController()
  const stop = sessionEvents.listen((event) => {
    if (!sameDirectory()) return
    if (action === "delete" && event.type === "session.deleted" && event.data.sessionID === id) confirmed.resolve()
    if (
      action === "rename" &&
      event.type === "session.renamed" &&
      event.data.sessionID === id &&
      event.data.title === title
    )
      confirmed.resolve()
  })
  try {
    await Promise.race([
      confirmed.promise,
      bounded(
        (signal) =>
          action === "delete"
            ? api.session.remove({ sessionID: id }, { signal })
            : api.session.update({ sessionID: id, title }, { signal }),
        { signal: AbortSignal.any([lifetime, request.signal]), timeoutMs: 15_000 },
      ),
    ])
  } catch (error) {
    if (action !== "delete" || !isSessionNotFoundError(error, id)) throw error
  } finally {
    stop()
    request.abort()
  }
}

export function createSessionActions() {
  const language = useLanguage()
  const dialog = useDialog()
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())
  const [write, setWrite] = createSignal(createLoadState())
  const busy = () => write().status === "loading"

  function show(action: Action, session: SessionInfo) {
    const owner = currentRuntime() ?? currentDraft()
    const directory = session.location.directory
    if (!owner || owner.signal.aborted || currentDirectory() !== directory || busy()) return
    const server = state.server
    const originalTitle = session.title
    const sameDirectory = () => state.server === server && currentDirectory() === directory
    const id = session.id
    const name = sessionLabel(session)
    const layer = uuid()
    const close = () => dialog.close(layer)
    const signal = AbortSignal.any([owner.signal, lifetime.signal])
    signal.addEventListener("abort", close, { once: true })

    const submit = async (title: string) => {
      if (signal.aborted || busy() || dialog.active?.id !== layer) return
      setWrite(transitionLoad(write(), { type: "started" }))
      const attempt = write().attempt
      try {
        // A confirmed write belongs to its captured target even if the dialog is dismissed.
        await saveSessionAction(owner.api, id, action, title, lifetime.signal, sameDirectory)
      } catch (error) {
        setWrite(transitionLoad(write(), { type: "failed", attempt, error }))
        if (!signal.aborted && dialog.active?.id !== layer) {
          showToast({
            variant: "error",
            title: language.t(action === "rename" ? "command.session.rename" : "command.session.delete"),
            description: readableError(error),
          })
        }
        return
      }
      setWrite(transitionLoad(write(), { type: "succeeded", attempt }))
      close()
      if (!sameDirectory()) return
      if (action === "delete") return sessionRemoved(id)
      const active = currentRuntime()
      if (active?.id === id && active.view().session.title === originalTitle) {
        active.setSession({ ...active.view().session, title })
      }
      void refreshRecentSessions()
    }
    setWrite(createLoadState())
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
