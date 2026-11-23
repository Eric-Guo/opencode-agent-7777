import type { SessionMessageInfo } from "@opencode/client/promise"
import type { SessionUserActions } from "@opencode/session-ui/actions"
import { Schema } from "effect"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { prompt } from "@/composer/persistence-singleton"
import { extractPromptFromMessage } from "@/composer/prompt"
import { PromptDraft } from "@/composer/schema"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { openRecentSession } from "@/home/sessions/switcher-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { bounded } from "@/runtime/server/operation"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { useForkConfirmation, useForkPicker } from "./commands/fork-dialog"
import { createForkState, FORK_TIMEOUT_MS, transitionFork, type ForkEvent } from "./fork-machine"

const sameDraft = Schema.toEquivalence(PromptDraft)

export function createSessionFork(input: {
  preparingAttachments: () => boolean
  visibleMessages: () => SessionMessageInfo[]
}) {
  const confirm = useForkConfirmation()
  const pick = useForkPicker()
  const language = useLanguage()
  // Each activation owns its admission lock, dialogs and request, including a return to the same session.
  return createMemo(() => {
    const runtime = currentRuntime()
    if (!runtime) return
    const lifetime = new AbortController()
    const signal = AbortSignal.any([runtime.signal, lifetime.signal])
    const [operation, setOperation] = createSignal(createForkState())
    const dispatch = (event: ForkEvent) => setOperation((state) => transitionFork(state, event))
    onCleanup(() => {
      dispatch({ type: "disposed" })
      lifetime.abort()
    })
    const current = () => !signal.aborted && currentRuntime() === runtime && state.session?.id === runtime.id
    const root = () => current() && !state.session?.parentID && !state.recentSessionSwitchingID
    const available = () => root() && operation().status === "idle"
    // The timeline also contains optimistic echoes and undelivered inbox entries.
    const delivered = (id: string) => {
      if (state.sessionPending.some((item) => item.id === id)) return
      const message = runtime.data.session.message.get(runtime.id, id)
      return message?.type === "user" ? message : undefined
    }
    const visible = (id: string) => input.visibleMessages().some((row) => row.id === id)
    const fork: NonNullable<SessionUserActions["fork"]> = async ({ sessionID, messageID }) => {
      if (!available() || sessionID !== runtime.id || !visible(messageID)) return
      const message = delivered(messageID)
      if (!message) {
        setState("error", language.t("session.fork.pending"))
        return
      }
      const seed = extractPromptFromMessage(message)
      const start = dispatch({
        type: "requested",
        confirm: !!(prompt.current().length || prompt.attachments().length || input.preparingAttachments()),
      })
      const { attempt } = start
      try {
        if (start.status === "confirming-replace") {
          if (!(await confirm(false, signal)) || !root() || !visible(messageID) || !delivered(messageID)) return
          dispatch({ type: "approved", attempt })
        }
        const approved = prompt.capture()
        const session = await bounded(
          (signal) => runtime.api.session.fork({ sessionID, before: messageID }, { signal }),
          { signal, timeoutMs: FORK_TIMEOUT_MS },
        )
        if (!root()) return
        const created = dispatch({
          type: "created",
          attempt,
          confirm: !sameDraft(approved, prompt.capture()) || input.preparingAttachments(),
        })
        if (created.status === "confirming-open") {
          // The write already succeeded. Cancelling here keeps the source draft and leaves the fork discoverable.
          void refreshRecentSessions()
          if (!(await confirm(true, signal)) || !root()) return
          dispatch({ type: "approved", attempt })
        }
        if (operation().status === "opening") await openRecentSession(session, seed)
      } catch (error) {
        if (current()) setState("error", readableError(error))
      } finally {
        dispatch({ type: "finished", attempt })
      }
    }
    const openPicker = () => {
      // The command menu restores the editor and its selection on the preceding frame callback.
      requestAnimationFrame(() => {
        if (!available()) return
        pick(
          () => input.visibleMessages().flatMap((row) => (row.type === "user" && delivered(row.id) ? [row] : [])),
          (messageID) => void fork({ sessionID: runtime.id, messageID }),
          signal,
        )
      })
    }
    return {
      available,
      fork,
      get openPicker() {
        return root() ? openPicker : undefined
      },
    }
  })
}
