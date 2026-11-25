import type { OpenCodeEvent, SessionInboxInfo } from "@opencode/client/promise"
import { batch } from "solid-js"
import { createStore, unwrap } from "solid-js/store"

type Receipt = { item: SessionInboxInfo; removed: boolean; revision: number }
export type PendingChanges = { retained: Set<string>; removed: string[] }

// An HTTP receipt overrides the shared inbox until an event for its ID or a later snapshot acknowledges it.
export function createSessionPending(shared: () => SessionInboxInfo[]) {
  const [local, setLocal] = createStore({
    receipts: Object.create(null) as Record<string, Receipt | undefined>,
    revision: 0,
  })
  function get(id: string) {
    const receipt = local.receipts[id]
    if (!receipt) return shared().findLast((item) => item.id === id)
    if (!receipt.removed) return receipt.item
  }
  return {
    revision: () => local.revision,
    get,
    list() {
      const items = new Map(shared().map((item) => [item.id, item]))
      for (const [id, receipt] of Object.entries(local.receipts)) {
        if (!receipt) continue
        if (receipt.removed) items.delete(id)
        else items.set(id, receipt.item)
      }
      return [...items.values()]
    },
    replace(before: SessionInboxInfo[], next: SessionInboxInfo[], revision: number): PendingChanges {
      setLocal("revision", (value) => value + 1)
      const retained = new Set<string>()
      const removed: string[] = []
      for (const item of next) {
        retained.add(item.id)
        setLocal("receipts", item.id, { item: structuredClone(unwrap(item)), removed: false, revision })
      }
      for (const item of before) {
        if (retained.has(item.id)) continue
        removed.push(item.id)
        // DELETE is idempotent. A later delivery event can still need the HTTP-only payload.
        setLocal("receipts", item.id, { item: structuredClone(unwrap(item)), removed: true, revision })
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
      const receipt = local.receipts[id]
      // The enqueue event and its HTTP admission share the server's creation time. A
      // later move or withdrawal of that admission can reach this client first.
      if (
        event.type === "session.inbox.enqueued" &&
        receipt?.item.time.created === event.created &&
        (receipt.removed || receipt.item.delivery !== event.data.item.delivery)
      )
        return { superseded: true }
      const delivered = event.type === "session.inbox.delivered" && id ? (receipt?.item ?? get(id)) : undefined
      if (event.type === "session.inbox.delivery.changed" && receipt?.removed) return { refresh: true }
      setLocal("receipts", id, undefined)
      if (event.type === "session.inbox.delivery.changed" && !shared().some((item) => item.id === id)) {
        // The shared reducer cannot promote an item that only the HTTP response has supplied.
        if (id && receipt)
          setLocal("receipts", id, {
            item: { ...structuredClone(unwrap(receipt.item)), delivery: event.data.delivery },
            removed: false,
            revision,
          })
        return { refresh: true }
      }
      return { delivered }
    },
  }
}
