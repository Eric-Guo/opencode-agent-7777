import { expect, test } from "bun:test"
import { loadHomeSessionPage } from "./index"

test("title search follows cursors and filters duplicates and the active conversation", async () => {
  const row = (id: string) => ({ id, title: id, time: { created: 0 } })
  const calls: (string | undefined)[] = []
  const source = {
    sessionID: "current",
    list: async (cursor?: string) => {
      calls.push(cursor)
      return cursor
        ? { items: [row("Match"), row("Match")], next: null }
        : { items: [row("current"), row("other")], next: "next" }
    },
  }
  expect((await loadHomeSessionPage(source, { search: "MATCH" })).items).toEqual([row("Match")])
  expect(calls).toEqual([undefined, "next"])
})

test("repeated cursors fail visibly", async () => {
  await expect(loadHomeSessionPage({ sessionID: "", list: async () => ({ items: [], next: "same" }) })).rejects.toThrow(
    "cursor",
  )
})
