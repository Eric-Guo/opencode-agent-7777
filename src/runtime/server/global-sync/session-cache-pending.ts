import type { OpenCodeEvent, SessionInboxInfo } from "@opencode/client/promise"
import { batch } from "solid-js"
import { createStore, unwrap } from "solid-js/store"

type Receipt = { item?: SessionInboxInfo; revision: number }
export type PendingChanges = { retained: Set<string>; removed: string[] }

// An HTTP receipt overrides the shared inbox until an event for its ID or a later snapshot acknowledges it.
export function createSessionPending(shared: () => SessionInboxInfo[]) {
  const [local, setLocal] = createStore({
    receipts: Object.create(null) as Record<string, Receipt | undefined>,
    revision: 0,
  })
  function get(id: string) {
    const receipt = local.receipts[id]
    return receipt ? receipt.item : shared().findLast((item) => item.id === id)
  }
  return {
    revision: () => local.revision,
    get,
    list() {
      const items = new Map(shared().map((item) => [item.id, item]))
      for (const [id, receipt] of Object.entries(local.receipts)) {
        if (!receipt) continue
        if (receipt.item) items.set(id, receipt.item)
        else items.delete(id)
      }
      return [...items.values()]
    },
    replace(before: SessionInboxInfo[], next: SessionInboxInfo[], revision: number): PendingChanges {
      setLocal("revision", (value) => value + 1)
      const retained = new Set<string>()
      const removed: string[] = []
      for (const item of next) {
        retained.add(item.id)
        setLocal("receipts", item.id, { item: structuredClone(unwrap(item)), revision })
      }
      for (const { id } of before) {
        if (retained.has(id)) continue
        removed.push(id)
        setLocal("receipts", id, { item: undefined, revision })
      }
      return { retained, removed }
    },
    acknowledge(started: number) {
      batch(() => {
        for (const [id, receipt] of Object.entries(local.receipts))
          if (receipt && receipt.revision <= started) setLocal("receipts", id, undefined)
      })
    },
    apply(event: OpenCodeEvent, revision: number) {
      if (!event.type.startsWith("session.inbox.")) return
      setLocal("revision", (value) => value + 1)
      if (!("inboxID" in event.data)) return
      const id = event.data.inboxID
      const delivered = event.type === "session.inbox.delivered" && id ? get(id) : undefined
      const receipt = local.receipts[id]
      setLocal("receipts", id, undefined)
      if (event.type === "session.inbox.delivery.changed" && !shared().some((item) => item.id === id)) {
        // The shared reducer cannot promote an item that only the HTTP response has supplied.
        if (id && receipt?.item)
          setLocal("receipts", id, {
            item: { ...structuredClone(unwrap(receipt.item)), delivery: event.data.delivery },
            revision,
          })
        return { refresh: true }
      }
      return { delivered }
    },
  }
}
