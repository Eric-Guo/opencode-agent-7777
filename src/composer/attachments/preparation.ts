import { createComputed, createSignal, onCleanup, untrack } from "solid-js"
import { abort } from "@opencode/util/abort"
import { translateSync } from "@/runtime/i18n/language"
import {
  ATTACHMENT_TIMED_OUT,
  ATTACHMENT_TIMEOUT_MS,
  createPreparationState,
  isPreparingAttachments,
  preparationEntries,
  sameAttachmentOwner,
  transitionPreparation,
  type AttachmentOwner,
  type PreparationEffect,
  type PreparationEvent,
} from "./preparation-machine"

type Run = {
  owner: AttachmentOwner
  valid: () => boolean
  controller: AbortController
  result: PromiseWithResolvers<boolean | undefined>
  done?: () => void
  timer?: ReturnType<typeof setTimeout>
}

// Each gesture owns its caller and resources. The machine alone owns admission and completion.
export function createAttachmentPreparation(input: {
  owner: () => AttachmentOwner
  onError: (error: unknown) => void
}) {
  const [state, setState] = createSignal(createPreparationState(untrack(input.owner)))
  const runs = new Map<number, Run>()
  const owned = (run: Run) =>
    untrack(state).status !== "disposed" && sameAttachmentOwner(run.owner, untrack(input.owner)) && run.valid()

  function effect(value: PreparationEffect) {
    const run = runs.get(value.attempt)
    if (!run) return
    if (value.type === "timer") {
      const entry = preparationEntries(untrack(state)).find((entry) => entry.attempt === value.attempt)
      if (entry?.phase !== "preparing" || entry.revision !== value.revision) return
      clearTimeout(run.timer)
      run.timer = setTimeout(
        () => dispatch({ type: "timed-out", attempt: value.attempt, revision: value.revision }),
        ATTACHMENT_TIMEOUT_MS,
      )
      return
    }
    clearTimeout(run.timer)
    runs.delete(value.attempt)
    // Settle before publishing callbacks: synchronous disposal must never strand a caller.
    run.result.resolve(value.type === "succeeded" && owned(run) ? value.added : undefined)
    if (value.type !== "succeeded") abort(run.controller)
    if (!owned(run)) return
    if (value.type === "succeeded") run.done?.()
    if (value.type === "failed") {
      input.onError(
        value.error === ATTACHMENT_TIMED_OUT ? new Error(translateSync("prompt.attachments.timeout")) : value.error,
      )
    }
  }

  function dispatch(event: PreparationEvent) {
    const previous = untrack(state)
    const next = transitionPreparation(previous, event)
    if (next.state !== previous) setState(next.state)
    next.effects.forEach(effect)
  }
  const sync = () => dispatch({ type: "owner.changed", owner: untrack(input.owner) })
  createComputed(() => dispatch({ type: "owner.changed", owner: input.owner() }))
  onCleanup(() => dispatch({ type: "disposed" }))

  return {
    preparing: () => isPreparingAttachments(state()),
    cancel: () => dispatch({ type: "cancel-all" }),
    start(phase: "choosing" | "preparing", valid: () => boolean, done?: () => void) {
      sync()
      const previous = untrack(state)
      if (previous.status === "disposed" || !valid()) return
      const attempt = previous.issued + 1
      const run: Run = {
        owner: previous.owner,
        valid,
        done,
        controller: new AbortController(),
        result: Promise.withResolvers<boolean | undefined>(),
      }
      runs.set(attempt, run)
      dispatch({ type: "started", phase })
      const current = () => {
        sync()
        if (!owned(run)) dispatch({ type: "cancelled", attempt })
        return preparationEntries(untrack(state)).some((entry) => entry.attempt === attempt)
      }
      const send = (event: PreparationEvent) => {
        if (current()) dispatch(event)
      }
      return {
        result: run.result.promise,
        signal: run.controller.signal,
        current,
        selected: () => send({ type: "selected", attempt }),
        progress: () => send({ type: "progress", attempt }),
        succeed: (added = false) => send({ type: "succeeded", attempt, added }),
        fail: (error: unknown) => send({ type: "failed", attempt, error }),
      }
    },
  }
}

export type AttachmentOperation = NonNullable<ReturnType<ReturnType<typeof createAttachmentPreparation>["start"]>>
