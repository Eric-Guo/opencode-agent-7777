import type { FormInfo, FormOption, SessionFormReplyInput } from "@opencode/client/promise"
import { abort } from "@opencode/util/abort"
import { createComputed, createMemo, createSignal, on, onCleanup, untrack } from "solid-js"
import type { OpenCodeEventStream } from "@/runtime/server/client-compact"
import {
  createWebSearchState,
  isProviderFormFor,
  selectWebSearchView,
  transitionWebSearch,
  webSearchProviderField,
  type WebSearchEffect,
  type WebSearchEvent,
} from "./websearch-machine"

export function createWebSearchRequest(input: {
  owner: () => unknown
  connected: () => boolean
  request: () => FormInfo | undefined
  providers: (sessionID: string, signal: AbortSignal) => Promise<FormOption[]>
  pendingForms: (sessionID: string, signal: AbortSignal) => Promise<FormInfo[]>
  rememberForm: (form: FormInfo) => void
  reply: (input: SessionFormReplyInput, signal: AbortSignal) => Promise<void | "already-settled">
  events: Pick<OpenCodeEventStream, "listen">
}) {
  const [machine, setMachine] = createSignal(createWebSearchState(input.connected()))
  const view = () => selectWebSearchView(machine())
  let work: { attempt: number; controller: AbortController; timer: ReturnType<typeof setTimeout> } | undefined
  let stopEvents: VoidFunction | undefined
  let done: PromiseWithResolvers<void> | undefined

  function stopWork() {
    if (!work) return
    clearTimeout(work.timer)
    abort(work.controller)
    work = undefined
  }

  function dispatch(event: WebSearchEvent) {
    const previous = untrack(machine)
    const { state, effects } = transitionWebSearch(previous, event)
    if (state === previous) return
    if (work && (state.status === "disposed" || state.attempt !== work.attempt || state.status !== previous.status))
      stopWork()
    setMachine(state)
    for (const effect of effects) void run(effect)
  }

  async function run(effect: WebSearchEffect) {
    if (effect.type === "respond.start") {
      done = Promise.withResolvers<void>()
      stopEvents = input.events.listen((event) => {
        const state = untrack(machine)
        if (state.status !== "responding") return
        if (event.type === "form.created") return dispatch({ type: "form.created", form: event.data.form })
        if (event.type === "form.cancelled" && event.data.sessionID === state.form.sessionID)
          dispatch({ type: "form.cancelled", id: event.data.id })
        if (event.type === "form.replied" && event.data.sessionID === state.form.sessionID)
          dispatch({ type: "form.replied", id: event.data.id, answer: event.data.answer })
      })
      return
    }
    if (effect.type === "respond.finish") {
      stopEvents?.()
      stopEvents = undefined
      done?.resolve()
      done = undefined
      return
    }

    const { attempt } = effect
    const controller = new AbortController()
    const { signal } = controller
    const timeout = {
      "providers.load": "providers.timed-out",
      "reply.send": "reply.timed-out",
      "handoff.wait": "handoff.timed-out",
    } as const
    work = {
      attempt,
      controller,
      timer: setTimeout(() => dispatch({ type: timeout[effect.type], attempt }), effect.timeoutMs),
    }
    try {
      if (effect.type === "providers.load") {
        const options = await input.providers(effect.sessionID, signal)
        if (!signal.aborted) dispatch({ type: "providers.loaded", attempt, options })
      } else if (effect.type === "reply.send") {
        const { sessionID, formID, answer } = effect
        const result = await input.reply({ sessionID, formID, answer }, signal)
        if (!signal.aborted)
          dispatch({ type: result === "already-settled" ? "reply.already-settled" : "reply.succeeded", attempt })
      } else {
        const waiting = untrack(machine)
        if (waiting.status !== "responding") return
        const forms = await input.pendingForms(waiting.form.sessionID, signal)
        const current = untrack(machine)
        if (signal.aborted || current.status !== "responding" || current.attempt !== attempt) return
        const provider = forms.find((form) => isProviderFormFor(current, form))
        if (!provider) return
        // Keep the recovered option list in the request queue for retry or explicit confirmation.
        input.rememberForm(provider)
        dispatch({ type: "form.created", form: provider })
      }
    } catch {
      if (signal.aborted) return
      if (effect.type === "providers.load") dispatch({ type: "providers.failed", attempt })
      if (effect.type === "reply.send") dispatch({ type: "reply.failed", attempt })
      // A failed pending-form read still leaves the event stream and handoff deadline active.
    }
  }

  const request = createMemo(() => {
    const form = input.request()
    if (!form) return
    const field = webSearchProviderField(form)
    if (!field) return form
    // Solid can reconcile options in place. Snapshot them so the machine observes changes to a pending form.
    const fields = form.fields.map((item) =>
      item === field ? { ...field, options: field.options?.map((option) => ({ ...option })) } : item,
    )
    return { ...form, fields: fields as FormInfo["fields"] }
  })
  createComputed(on(input.owner, () => dispatch({ type: "owner.changed", form: request() }), { defer: true }))
  createComputed(on(input.connected, (connected) => dispatch({ type: "connection.changed", connected })))
  createComputed(on(request, (form) => dispatch({ type: "request.changed", form })))
  onCleanup(() => dispatch({ type: "disposed" }))

  return {
    request: () => view().request,
    options: () => view().options,
    selected: () => view().selected,
    specific: () => view().specific,
    loading: () => view().loading,
    loadFailed: () => view().loadFailed,
    failed: () => view().failed,
    optionUnavailable: () => view().optionUnavailable,
    sending: () => view().sending,
    connected: input.connected,
    select: (value: string) => dispatch({ type: "select", value }),
    retry: () => dispatch({ type: "retry" }),
    submit(selection: string | false) {
      const previous = done
      dispatch({ type: "submit", selection })
      return done !== previous && done ? done.promise : Promise.resolve()
    },
  }
}

export type WebSearchRequestModel = ReturnType<typeof createWebSearchRequest>
