import type { SessionUserActions } from "@opencode/session-ui/actions"
import { Schema } from "effect"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { prompt } from "@/composer/persistence-singleton"
import { extractPromptFromMessage } from "@/composer/prompt"
import { PromptDraft } from "@/composer/schema"
import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { openRecentSession } from "@/home/sessions/switcher-compact"
import { useLanguage } from "@/runtime/i18n/language"
import { createLoadState, transitionLoad } from "@/runtime/server/load-machine"
import { bounded } from "@/runtime/server/operation"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"
import { useForkConfirmation } from "./commands/fork-dialog"

const sameDraft = Schema.toEquivalence(PromptDraft)

export function createSessionFork(preparingAttachments: () => boolean) {
  const confirm = useForkConfirmation()
  const language = useLanguage()
  // Each activation owns its admission lock, dialogs and request, including a return to the same session.
  return createMemo(() => {
    const runtime = currentRuntime()
    if (!runtime) return
    const lifetime = new AbortController()
    onCleanup(() => lifetime.abort())
    const signal = AbortSignal.any([runtime.signal, lifetime.signal])
    const [operation, setOperation] = createSignal(createLoadState())
    const available = () =>
      !signal.aborted &&
      state.session?.id === runtime.id &&
      !state.session.parentID &&
      !state.recentSessionSwitchingID &&
      operation().status !== "loading"
    const fork: NonNullable<SessionUserActions["fork"]> = async ({ sessionID, messageID }) => {
      if (!available() || sessionID !== runtime.id) return
      // The displayed transcript also contains optimistic echoes and undelivered inbox entries.
      const message = runtime.data.session.message.get(sessionID, messageID)
      if (message?.type !== "user" || state.sessionPending.some((item) => item.id === messageID)) {
        setState("error", language.t("session.fork.pending"))
        return
      }
      const seed = extractPromptFromMessage(message)
      const { attempt } = setOperation(transitionLoad(operation(), { type: "started" }))
      const current = () => !signal.aborted && currentRuntime() === runtime && state.session?.id === sessionID
      try {
        if (
          (prompt.current().length || prompt.attachments().length || preparingAttachments()) &&
          !(await confirm(false, signal))
        )
          return
        if (!current()) return
        const approved = prompt.capture()
        const session = await bounded(
          (signal) => runtime.api.session.fork({ sessionID, before: messageID }, { signal }),
          {
            signal,
            timeoutMs: 30_000,
          },
        )
        if (!current()) return
        if (!sameDraft(approved, prompt.capture()) || preparingAttachments()) {
          // The write already succeeded. Cancelling here keeps the source draft and leaves the fork discoverable.
          void refreshRecentSessions()
          if (!(await confirm(true, signal)) || !current()) return
        }
        await openRecentSession(session, seed)
      } catch (error) {
        setOperation((value) => transitionLoad(value, { type: "failed", attempt, error }))
        if (current()) setState("error", readableError(error))
      } finally {
        setOperation((value) => transitionLoad(value, { type: "succeeded", attempt }))
      }
    }
    return { available, fork }
  })
}
