import type { OpenCodeClient, SessionInfo } from "@opencode/client/promise"
import { abort } from "@opencode/util/abort"
import { createSignal } from "solid-js"
import { translateSync } from "@/runtime/i18n/language"
import { isSessionNotFoundError } from "@/runtime/server/errors"
import { clearReadError, reportReadError } from "@/runtime/server/read-errors"

type Walk = { missing: string; timer: ReturnType<typeof setTimeout>; failed?: { error: unknown } }

// One walk per pending owner, one GET per missing session. Each walk keeps its original deadline as
// it advances through parents. A shared GET lives until the last walk that needs it finishes.
export function createRequestAncestry(rootID: string, get: OpenCodeClient["session"]["get"], signal: AbortSignal) {
  let known = new Map<string, SessionInfo>()
  let owners: readonly string[] = []
  const fetched = new Map<string, SessionInfo | undefined>()
  const reads = new Map<string, AbortController>()
  const walks = new Map<string, Walk>()
  const [records, setRecords] = createSignal<SessionInfo[]>([])
  const [loading, setLoading] = createSignal(false)
  let reported: Walk["failed"]

  function read(id: string) {
    const controller = new AbortController()
    reads.set(id, controller)
    void Promise.try(() => get({ sessionID: id }, { signal: controller.signal })).then(
      (session) => finish(session?.id === id ? session : undefined),
      (error) => {
        if (controller.signal.aborted) return
        if (isSessionNotFoundError(error, id)) return finish(undefined)
        for (const walk of walks.values()) {
          if (walk.missing === id && !walk.failed) walk.failed = { error }
        }
        reads.delete(id)
        sync()
      },
    )
    function finish(session: SessionInfo | undefined) {
      if (controller.signal.aborted) return
      fetched.set(id, session)
      reads.delete(id)
      sync()
    }
  }

  function missingAncestor(owner: string, visited: Set<string>) {
    const path = new Set<string>()
    let id: string | undefined = owner
    while (id && id !== rootID && !path.has(id)) {
      path.add(id)
      visited.add(id)
      const session: SessionInfo | undefined = known.get(id) ?? fetched.get(id)
      if (!session && !fetched.has(id)) return id
      id = session?.parentID
    }
  }

  function sync() {
    if (signal.aborted) return
    const needed = new Set<string>()
    const visited = new Set<string>()
    const unresolved = new Set<string>()
    for (const owner of owners) {
      const id = missingAncestor(owner, visited)
      if (!id) continue
      unresolved.add(owner)
      let walk = walks.get(owner)
      if (!walk) {
        const timer = setTimeout(() => {
          const active = walks.get(owner)
          if (!active || active.failed) return
          active.failed = { error: new Error(translateSync("error.operationTimeout")) }
          sync()
        }, 30_000)
        walk = { missing: id, timer }
        walks.set(owner, walk)
      }
      walk.missing = id
      if (!walk.failed) needed.add(id)
    }

    for (const [id, walk] of walks) {
      if (unresolved.has(id)) continue
      clearTimeout(walk.timer)
      walks.delete(id)
    }
    for (const [id, controller] of reads) {
      if (needed.has(id)) continue
      reads.delete(id)
      abort(controller)
    }
    for (const id of needed) if (!reads.has(id)) read(id)
    setLoading(needed.size > 0)

    // Only pending requests retain extra records. The recent-session page always owns its own rows.
    for (const id of fetched.keys()) if (!visited.has(id) || known.has(id)) fetched.delete(id)
    const extra = [...visited].map((id) => fetched.get(id)).filter((row): row is SessionInfo => !!row)
    setRecords((previous) =>
      previous.length === extra.length && previous.every((row, index) => row === extra[index]) ? previous : extra,
    )

    const failure = Array.from(walks.values()).find((walk) => walk.failed)?.failed
    if (reported === failure) return
    reported = failure
    if (!failure) return clearReadError(walks)
    reportReadError(walks, failure.error, () => {
      if (signal.aborted || reported !== failure) return
      for (const [id, walk] of walks) {
        if (!walk.failed) continue
        clearTimeout(walk.timer)
        walks.delete(id)
      }
      sync()
    })
  }

  signal.addEventListener(
    "abort",
    () => {
      for (const walk of walks.values()) clearTimeout(walk.timer)
      for (const controller of reads.values()) abort(controller)
      clearReadError(walks)
    },
    { once: true },
  )

  return {
    records,
    loading,
    update(sessions: readonly SessionInfo[], pending: readonly string[]) {
      known = new Map(sessions.map((session) => [session.id, session]))
      owners = pending
      sync()
    },
    removed(id: string) {
      if (!owners.length) return
      known.delete(id)
      fetched.set(id, undefined)
      sync()
    },
  }
}
