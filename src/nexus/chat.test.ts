import { expect, test } from "bun:test"
import type { Turn } from "@cybros/agent"
import { latestDialogs, loadTurns, projectTurn, updateLive, type Frame, type Snapshot } from "./chat"
import { timeline } from "./timeline"

function reply(n: number, origin: string | null = null): Turn {
  return {
    public_id: String(n),
    position: n,
    kind: "direct_reply",
    origin,
    role: "assistant",
    status: "completed",
    created_at: "2026-11-04T00:00:00Z",
    input_public_id: "in" + n,
    active_variant: {
      public_id: "v" + n,
      content: "reply " + n,
      prompt_text: "prompt " + n,
      run_public_id: null,
    },
  } as Turn
}
test("reads backwards past kernel receipts to hydrate exactly nine user dialogs", async () => {
  const before: (number | undefined)[] = []
  const rows = await loadTurns(async (cursor) => {
    before.push(cursor)
    const items =
      cursor === undefined ? [reply(11), reply(12, "task_result")] : Array.from({ length: 10 }, (_, i) => reply(i + 1))
    return { items, before_position: items[0].position, after_position: items.at(-1)!.position }
  })
  expect(before).toEqual([undefined, 11])
  expect(rows.filter((row) => row.prompt !== null).map((row) => row.id)).toEqual([
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
  ])
  expect(rows.at(-1)?.text).toBe("reply 12")
  const snapshot: Snapshot = {
    turns: rows,
    decisions: [],
    busy: true,
    problem: null,
    pending: [
      { id: "in11", text: "already materialized", created: 0 },
      { id: "new", text: "pending", created: 0 },
    ],
  }
  const doc = timeline("chat", snapshot, {})
  expect(doc.messages.filter((m) => m.type === "user").map((m) => m.text)).toEqual([
    "prompt 4",
    "prompt 5",
    "prompt 6",
    "prompt 7",
    "prompt 8",
    "prompt 9",
    "prompt 10",
    "prompt 11",
    "pending",
  ])
})

test("a reset clears only its own candidate and settled content replaces partial text", () => {
  const live: Record<string, string> = {}
  const frame = (type: string, variant: string, text = ""): Frame => ({
    type,
    variant_public_id: variant,
    turn_public_id: "1",
    text,
  })
  updateLive(live, frame("text_delta", "old", "stale"))
  updateLive(live, frame("text_delta", "v1", "hello"))
  updateLive(live, frame("text_delta", "v1", " world"))
  updateLive(live, frame("stream_reset", "old"))
  const row = projectTurn(reply(1))
  const snapshot = { turns: [{ ...row, status: "running" }], decisions: [], busy: true, pending: [], problem: null }
  expect(timeline("chat", snapshot, live).messages.at(-1)).toMatchObject({
    content: [{ type: "text", text: "hello world" }],
  })
  updateLive(live, frame("turn", "v1"))
  expect(live).toEqual({})
  expect(timeline("chat", { ...snapshot, turns: latestDialogs([row]) }, live).messages.at(-1)).toMatchObject({
    content: [{ type: "text", text: "reply 1" }],
  })
})
