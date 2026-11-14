import { batch, createComputed, createSignal, on, onCleanup, untrack, type Accessor } from "solid-js"
import { abort } from "@opencode/util/abort"
import type { SessionMessageUser } from "@opencode/client/promise"
import { prompt } from "@/composer/persistence-singleton"
import { extractPromptFromMessage } from "@/composer/prompt"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { currentRuntime, setState, state } from "@/runtime/server/session-store-compact"
import { translateSync } from "@/runtime/i18n/language"
import { readableError } from "@/shell/errors/readable"
import { selectSessionUserMessages } from "./session-domain"
import { captureSessionOwnership } from "./session-ownership"
import {
  createSessionRevertState,
  REVERT_TIMEOUT_MS,
  selectSessionRevertBusy,
  transitionSessionRevert,
  type SessionRevertEvent,
} from "./revert-machine"

export function createSessionRevert(input: { disabled?: Accessor<boolean> } = {}) {
  const [mutation, setMutation] = createSignal(createSessionRevertState())
  let finish: VoidFunction | undefined
  const dispatch = (event: SessionRevertEvent, active?: NonNullable<ReturnType<typeof captureSessionOwnership>>) => {
    const previous = untrack(mutation)
    const next = transitionSessionRevert(previous, event)
    if (next.state === previous) return false
    batch(() => {
      setMutation(next.state)
      if (previous.status === "running" && next.state.status !== "running") {
        const complete = finish
        finish = undefined
        complete?.()
      }
      if (!active?.current()) return
      if (untrack(mutation) !== next.state) return
      for (const effect of next.effects) {
        if (effect.type === "failed") setState("error", readableError(effect.error))
        if (effect.type === "timed-out") setState("error", translateSync("session.revert.timeout"))
        if (effect.type === "reconcile") {
          active.runtime.data.session.invalidate(active.sessionID)
          void active.runtime.data.session.sync(active.sessionID).catch(() => {})
          active.runtime.schedule(0)
        }
        if (effect.type !== "apply" || previous.status !== "running") continue
        active.runtime.setSession({
          ...active.runtime.view().session,
          revert: effect.result ? structuredClone(effect.result) : undefined,
        })
        const operation = effect.operation
        // Non-editor writers and nested store edits can change a draft while waiting.
        if (
          prompt.store[0].prompt === operation.originalParts &&
          JSON.stringify(prompt.capture()) === operation.originalDraft
        )
          prompt.restore(operation.draft)
        void active.runtime.refreshMessages(FETCH_MESSAGE_LIMIT).then(
          () => dispatch({ type: "refreshed", attempt: previous.attempt }, active),
          (error: unknown) => dispatch({ type: "failed", attempt: previous.attempt, error }, active),
        )
      }
    })
    return true
  }
  createComputed(on([currentRuntime, () => state.session?.id], () => dispatch({ type: "reset" }), { defer: true }))
  onCleanup(() => dispatch({ type: "disposed" }))
  // The embedded app rewinds only parked, hydrated history. Pending follow-ups
  // must be sent or removed first, since they were written against that history.
  const disabled = () =>
    selectSessionRevertBusy(mutation()) ||
    mutation().status === "disposed" ||
    input.disabled?.() ||
    state.status !== "ready" ||
    !state.session ||
    state.submitting ||
    state.messagesLoading ||
    state.sessionStatus.type !== "idle" ||
    state.sessionPending.length > 0
  const messages = () => selectSessionUserMessages(state.sessionMessages)
  const boundary = () => {
    const reverted = state.session?.revert?.messageID
    return reverted ? messages().findIndex((message) => message.id === reverted) : messages().length
  }
  const canUndo = () => !disabled() && boundary() > 0
  const canRedo = () => !disabled() && !!state.session?.revert && boundary() >= 0

  const change = async (message?: SessionMessageUser) => {
    if (disabled()) return
    const active = captureSessionOwnership()
    if (!active) return
    if (
      !dispatch({
        type: "requested",
        operation: {
          messageID: message?.id,
          draft: message ? extractPromptFromMessage(message) : undefined,
          originalParts: prompt.store[0].prompt,
          originalDraft: JSON.stringify(prompt.capture()),
        },
      })
    )
      return
    const current = untrack(mutation)
    if (current.status !== "running") return
    const { attempt, operation } = current
    const controller = new AbortController()
    const done = Promise.withResolvers<void>()
    const retire = () => dispatch({ type: "reset" })
    const timer = setTimeout(() => dispatch({ type: "timed-out", attempt }, active), REVERT_TIMEOUT_MS)
    active.runtime.signal.addEventListener("abort", retire, { once: true })
    finish = () => {
      clearTimeout(timer)
      active.runtime.signal.removeEventListener("abort", retire)
      abort(controller)
      done.resolve()
    }
    setState("error", "")
    if (untrack(mutation) !== current) return done.promise
    void Promise.try(async () =>
      operation.messageID
        ? active.client.session.revert.stage(
            { sessionID: active.sessionID, messageID: operation.messageID },
            { signal: controller.signal },
          )
        : active.client.session.revert.clear({ sessionID: active.sessionID }, { signal: controller.signal }),
    ).then(
      (result) => dispatch({ type: "succeeded", attempt, result }, active),
      (error: unknown) => dispatch({ type: "failed", attempt, error }, active),
    )
    return done.promise
  }

  const to = (messageID: string) => {
    const message = messages().find((item) => item.id === messageID)
    if (message) return change(message)
  }
  const undo = () => {
    if (canUndo()) return change(messages()[boundary() - 1])
  }
  const redo = () => {
    if (canRedo()) return change(messages()[boundary() + 1])
  }

  return { to, undo, redo, canUndo, canRedo, busy: () => selectSessionRevertBusy(mutation()) }
}

export type SessionRevert = ReturnType<typeof createSessionRevert>
