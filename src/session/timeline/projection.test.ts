import { afterEach, expect, test } from "bun:test"
import type { SessionMessageAssistant } from "@opencode/client/promise"
import { createRoot } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { createTimelineMessages } from "./projection"

function assistant(id: string, text: string): SessionMessageAssistant {
  return {
    id,
    type: "assistant",
    agent: "7777",
    model: { id: "model", providerID: "provider" },
    time: { created: 1 },
    content: [{ type: "text", text }],
  }
}

browserSuite(import.meta.path, () => {
  const disposers: VoidFunction[] = []
  afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

  function fixture(messages: SessionMessageAssistant[]) {
    const [source, setSource] = createStore({ messages })
    const projected = createRoot((dispose) => {
      disposers.push(dispose)
      return createTimelineMessages(() => source.messages)
    })
    const row = (index: number) => projected()[index] as SessionMessageAssistant
    return { source, setSource, projected, row }
  }

  test("a text delta updates the live part without replacing either turn or rewriting the transcript", () => {
    const { source, setSource, projected, row } = fixture([
      assistant("earlier", "First answer"),
      assistant("live", "来源（"),
    ])
    const turns = projected()
    const earlier = row(0)
    const earlierPart = earlier.content[0]
    const live = row(1)
    const content = live.content
    const livePart = content[0]
    setSource(
      "messages",
      1,
      "content",
      0,
      produce((part) => {
        if (part.type === "text") part.text += "https://example.org/report），见下文。"
      }),
    )

    expect(row(0)).toBe(earlier)
    expect(row(0).content[0]).toBe(earlierPart)
    expect(row(1)).toBe(live)
    expect(row(1).content[0]).toBe(livePart)
    expect(projected()).toBe(turns)
    expect(live.content).toBe(content)
    expect(livePart).toMatchObject({ text: "来源（<https://example.org/report>），见下文。" })
    expect(source.messages[1].content[0]).toMatchObject({ text: "来源（https://example.org/report），见下文。" })

    setSource(
      "messages",
      1,
      produce((message) => {
        message.finish = "stop"
        message.time.completed = 2
        message.content.push({ type: "reasoning", text: "（https://example.org/raw）" })
      }),
    )
    expect(live.finish).toBe("stop")
    expect(live.time.completed).toBe(2)
    expect(live.content[0]).toBe(livePart)
    expect(live.content[1]).toBe(source.messages[1].content[1])
    setSource("messages", 1, "content", (parts) => parts.slice(1))
    expect(live.content).toHaveLength(1)
    expect(live.content[0]).toBe(source.messages[1].content[0])
  })

  test("hydration can reconcile a different part kind in place or replace a message with the same ID", () => {
    const { source, setSource, row } = fixture([assistant("live", "First part")])
    const originalPart = source.messages[0].content[0]
    const hydrated = assistant("live", "")
    hydrated.content = [{ type: "reasoning", text: "（https://example.org/raw）" }]
    setSource("messages", reconcile([hydrated]))
    expect(source.messages[0].content[0]).toBe(originalPart)
    expect(row(0).content[0]).toBe(source.messages[0].content[0])
    setSource("messages", reconcile([assistant("live", "（https://example.org/hydrated）")]))
    expect(row(0).content[0]).toMatchObject({ type: "text", text: "（<https://example.org/hydrated>）" })

    const previous = row(0)
    setSource("messages", [assistant("live", "Replacement")])
    expect(row(0)).not.toBe(previous)
    expect(row(0).content[0]).toMatchObject({ type: "text", text: "Replacement" })
  })
})
