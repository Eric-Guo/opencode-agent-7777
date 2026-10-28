import { expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { sessionContextUsage } from "./model"

function fixture() {
  return {
    session: { tokens: { input: 1000, output: 200, reasoning: 50, cache: { read: 100, write: 150 } } },
    models: [
      {
        id: "model",
        providerID: "other",
        name: "Other model",
        providerName: "Other",
        limit: { context: 50, output: 10 },
      },
      {
        id: "model",
        providerID: "provider",
        name: "Model",
        providerName: "Provider",
        limit: { context: 1000, output: 100 },
      },
    ],
    messages: [
      { id: "user_1", type: "user", text: "first", time: { created: 1 } },
      {
        id: "assistant_1",
        type: "assistant",
        agent: "7777",
        model: { id: "model", providerID: "provider" },
        content: [],
        tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 10, write: 15 } },
        time: { created: 2 },
      },
      { id: "user_2", type: "user", text: "second", time: { created: 3 } },
      {
        id: "assistant_2",
        type: "assistant",
        agent: "7777",
        model: { id: "model", providerID: "provider" },
        content: [],
        tokens: { input: 200, output: 40, reasoning: 10, cache: { read: 20, write: 30 } },
        time: { created: 4 },
      },
    ] satisfies SessionMessageInfo[],
  }
}

test("header and details use the active usage step and catalog while retaining server session totals", () => {
  const input = fixture()
  const original = structuredClone(input)
  const latest = sessionContextUsage(input)
  expect([latest.total, latest.usage, latest.sessionTotal, latest.model?.providerName]).toEqual([
    300,
    30,
    1500,
    "Provider",
  ])

  const undone = sessionContextUsage({ ...input, session: { ...input.session, revert: { messageID: "user_2" } } })
  expect([undone.message?.id, undone.total, undone.usage, undone.sessionTotal]).toEqual(["assistant_1", 150, 15, 1500])
  expect(input).toEqual(original)
})

test("missing context and unknown model capacity remain distinct from reported zero usage", () => {
  const input = fixture()
  const compacted: SessionMessageInfo[] = [
    ...input.messages,
    {
      id: "compact",
      type: "compaction",
      status: "completed",
      reason: "auto",
      summary: "Earlier context",
      time: { created: 5 },
    },
  ]
  const afterCompaction = sessionContextUsage({ ...input, messages: compacted })
  expect([afterCompaction.total, afterCompaction.usage, afterCompaction.sessionTotal]).toEqual([
    undefined,
    undefined,
    1500,
  ])

  const unknown = sessionContextUsage({ ...input, models: [] })
  expect([unknown.message?.model.id, unknown.total, unknown.usage]).toEqual(["model", 300, undefined])

  const last = input.messages[3]
  if (last.type !== "assistant") throw new Error("Missing fixture assistant")
  const zero = sessionContextUsage({
    ...input,
    messages: [
      ...compacted,
      {
        ...last,
        id: "assistant_3",
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ],
  })
  expect([zero.total, zero.usage, zero.sessionTotal]).toEqual([0, 0, 1500])

  const noSession = sessionContextUsage({ ...input, session: undefined })
  expect([noSession.message, noSession.model, noSession.total, noSession.usage, noSession.sessionTotal]).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ])
})
