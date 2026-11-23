import type { OpenCodeClient, OpenCodeEvent, ShellOutputInput } from "@opencode/client/promise"
import type { Data } from "@opencode/client/solid"
import { sameDirectory } from "@opencode/util/path"
import { batch, onCleanup } from "solid-js"
import { bounded } from "../operation"

type ShellEvent = Extract<OpenCodeEvent, { type: "shell.created" | "shell.deleted" | "shell.exited" }>
type InventoryRead = { updates: Map<string, ShellEvent>; afterSnapshot?: ShellEvent[] }
export type ShellInventoryReads = Map<string, () => ReturnType<OpenCodeClient["shell"]["list"]>>

export function createSessionShells(input: {
  directory: string
  api: OpenCodeClient["shell"]
  inventory: Data["shell"]
  reads: ShellInventoryReads
  signal: AbortSignal
  publish: (event: ShellEvent) => void
}) {
  const location = { directory: input.directory }
  const owner = new AbortController()
  const signal = AbortSignal.any([input.signal, owner.signal])
  onCleanup(() => owner.abort())
  let observed = false
  let refreshAgain = false
  let pending: InventoryRead | undefined

  async function list() {
    const page = await bounded((signal) => input.api.list({ location }, { signal }), { signal })
    signal.throwIfAborted()
    // The server can return a canonical Windows path or include a workspace ID. Publish
    // snapshots and events under the same directory key that the compact timeline observes.
    if (!pending) return { ...page, location }
    const rows = new Map(page.data.map((info) => [info.id, info]))
    for (const [id, event] of pending.updates) {
      if (event.type === "shell.created") rows.set(id, event.data.info)
      else rows.delete(id)
    }
    // The public client commits this snapshot asynchronously. Replay events arriving
    // between snapshot and commit once, after it publishes the rows.
    pending.afterSnapshot = []
    return { location, data: [...rows.values()] }
  }

  function refresh() {
    if (!observed || signal.aborted) return
    if (pending) {
      refreshAgain = true
      return
    }
    const read: InventoryRead = { updates: new Map() }
    pending = read
    // The shared client can queue a read behind an earlier visit to the same directory.
    // Keep its cancellation scope until that queued read settles, even after navigation.
    input.reads.set(input.directory, list)
    input.inventory.invalidate(location)
    void input.inventory
      .sync(location)
      .catch(() => {
        // The tool's own status and output remain usable when inventory is unavailable.
      })
      .finally(() => {
        if (input.reads.get(input.directory) === list) input.reads.delete(input.directory)
        if (signal.aborted) return
        pending = undefined
        batch(() => read.afterSnapshot?.forEach(input.publish))
        if (refreshAgain) {
          refreshAgain = false
          refresh()
        }
      })
  }

  return {
    running(id: string) {
      return input.inventory.list(location).some((shell) => shell.id === id)
    },
    output(request: ShellOutputInput) {
      if (!observed) {
        observed = true
        refresh()
      }
      return bounded((signal) => input.api.output({ ...request, location }, { signal }), { signal, timeoutMs: 15_000 })
    },
    refresh,
    apply(event: ShellEvent) {
      if (signal.aborted || !event.location || !sameDirectory(event.location.directory, location.directory))
        return false
      const scoped = { ...event, location }
      if (pending?.afterSnapshot) pending.afterSnapshot.push(scoped)
      else {
        pending?.updates.set(event.type === "shell.created" ? event.data.info.id : event.data.id, scoped)
        input.publish(scoped)
      }
      return true
    },
  }
}
