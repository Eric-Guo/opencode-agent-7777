import type { OpenCodeClient, SessionMessageInfo } from "@opencode/client/promise"
import type { TurnDiffInput, TurnDiffSource } from "@opencode/session-ui/context"
import { createMemo, createSignal, mapArray, onCleanup, untrack, type Accessor } from "solid-js"
import { bounded } from "@/runtime/server/operation"
import { LOADING_TURN_DIFF, transitionTurnDiff, type TurnDiffEntry } from "./turn-diff-machine"

const TURN_DIFF_TIMEOUT_MS = 15_000

// A steer can become the first visible prompt as the window moves. Every prompt
// through the same idle marker addresses the same finished turn on the server.
function closingMarkers(messages: SessionMessageInfo[]) {
  const markers = new Map<string, string>()
  let end: string | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.type === "idle") end = message.id
    if (message.type === "user" && end) markers.set(message.id, end)
  }
  return markers
}

export function createTurnDiffSource(input: {
  sessionID: string
  diff: OpenCodeClient["session"]["diff"]
  signal: AbortSignal
  messages: Accessor<SessionMessageInfo[]>
}): TurnDiffSource {
  // Rewinding through a steer can retain the opening prompt while replacing its
  // ending. Give the new ending its own request and retire the old patch.
  const markers = createMemo(() => closingMarkers(input.messages()))
  const entries = mapArray(
    () => [...new Set(markers().values())],
    (end) => {
      const owner = new AbortController()
      const signal = AbortSignal.any([input.signal, owner.signal])
      onCleanup(() => owner.abort())
      const [state, setState] = createSignal<TurnDiffEntry>()
      function load(from: string) {
        const previous = untrack(state)
        const next = transitionTurnDiff(previous, { type: "load" })
        if (signal.aborted || next === previous) return
        setState(next)
        void bounded((signal) => input.diff({ sessionID: input.sessionID, from, context: 3 }, { signal }), {
          signal,
          timeoutMs: TURN_DIFF_TIMEOUT_MS,
        }).then(
          (diffs) => !signal.aborted && setState((entry) => transitionTurnDiff(entry, { type: "loaded", diffs })),
          () => !signal.aborted && setState((entry) => transitionTurnDiff(entry, { type: "failed" })),
        )
      }
      return [end, { state, load }] as const
    },
  )
  const byID = createMemo(() => new Map(entries()))
  const entry = (turn: TurnDiffInput) => {
    const end = markers().get(turn.from)
    return end && turn.sessionID === input.sessionID ? byID().get(end) : undefined
  }
  return {
    state: (turn) => entry(turn)?.state() ?? LOADING_TURN_DIFF,
    load: (turn) => untrack(() => entry(turn))?.load(turn.from),
  }
}
