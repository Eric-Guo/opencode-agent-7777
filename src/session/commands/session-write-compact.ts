import type { OpenCodeClient, OpenCodeEvent } from "@opencode/client/promise"
import { bounded } from "@/runtime/server/operation"
import { sessionEvents } from "@/runtime/server/sync-session-compact"

export type SessionWriteTarget = {
  api: OpenCodeClient
  sessionID: string
  lifetime: AbortSignal
  sameDirectory: () => boolean
}

// Subscribe before sending. A matching event can release the dialog even while HTTP is pending.
export async function confirmSessionWrite(
  target: SessionWriteTarget,
  matches: (event: OpenCodeEvent) => boolean,
  send: (signal: AbortSignal) => Promise<unknown>,
) {
  const confirmed = Promise.withResolvers<void>()
  const request = new AbortController()
  const stop = sessionEvents.listen((event) => {
    if (target.sameDirectory() && matches(event)) confirmed.resolve()
  })
  try {
    await Promise.race([
      confirmed.promise,
      bounded(send, { signal: AbortSignal.any([target.lifetime, request.signal]), timeoutMs: 15_000 }),
    ])
  } finally {
    stop()
    request.abort()
  }
}
