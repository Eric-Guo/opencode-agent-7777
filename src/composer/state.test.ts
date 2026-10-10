import { describe, expect, test } from "bun:test"
import { Skill } from "@opencode/schema/skill"
import { Schema } from "effect"
import { produce } from "solid-js/store"
import { PromptDraft, type PromptReference } from "./schema"
import { createPromptState, type PromptAttachment } from "./state"

const attachment = (id: string): PromptAttachment => ({
  id,
  filename: `${id}.png`,
  mime: "image/png",
  url: `data:image/png;base64,${id}`,
})

describe("prompt state", () => {
  test("restores ordered valid draft mentions and leaves malformed ranges as text", () => {
    const references: PromptReference[] = [
      { type: "file", path: "file", url: "file:///repo/file", content: "@file", start: 17, end: 22 },
      { type: "agent", name: "agent", content: "@agent", start: 4, end: 10 },
      { type: "file", path: "overlap", content: "@agent", start: 4, end: 10 },
      { type: "agent", name: "missing", content: "@missing", start: 11, end: 16 },
      { type: "agent", name: "fraction", content: " ", start: 10.5, end: 11 },
      { type: "agent", name: "outside", content: "@file", start: 23, end: 28 },
    ]
    const before = structuredClone(references)
    const state = createPromptState({ prompt: "Ask @agent about @file", attachments: [], references })

    expect(state.store[0].prompt).toEqual([
      { type: "text", content: "Ask ", start: 0, end: 4 },
      { type: "agent", name: "agent", content: "@agent", start: 4, end: 10 },
      { type: "text", content: " about ", start: 10, end: 17 },
      { type: "file", path: "file", url: "file:///repo/file", content: "@file", start: 17, end: 22 },
    ])
    expect(state.capture()).toEqual({
      prompt: "Ask @agent about @file",
      attachments: [],
      references: [
        { type: "agent", name: "agent", content: "@agent", start: 4, end: 10 },
        { type: "file", path: "file", url: "file:///repo/file", content: "@file", start: 17, end: 22 },
      ],
    })
    expect(references).toEqual(before)
  })

  test("captured agent mentions remain isolated from subsequent Solid store edits", () => {
    const draft = {
      prompt: "Ask @explore",
      attachments: [],
      references: [{ type: "agent" as const, name: "explore", content: "@explore", start: 4, end: 12 }],
    }
    const state = createPromptState(draft)
    const captured = state.capture()
    state.store[1](
      produce((value) => {
        const agent = value.prompt[1]
        if (agent.type !== "agent") throw new Error("Expected agent mention")
        agent.name = "changed"
      }),
    )
    expect(captured.references).toEqual([{ type: "agent", name: "explore", content: "@explore", start: 4, end: 12 }])
    expect(draft.references).toEqual([{ type: "agent", name: "explore", content: "@explore", start: 4, end: 12 }])
    state.reset()
    state.restore(captured)
    expect(state.store[0].prompt[1]).toEqual({ type: "agent", name: "explore", content: "@explore", start: 4, end: 12 })
  })
  test("round-trips selected skills through persistence and isolates subsequent edits", () => {
    const draft = {
      prompt: "Use @plugin/review here",
      attachments: [],
      references: [
        {
          type: "skill" as const,
          id: Skill.ID.make("plugin/review"),
          name: Skill.Name.make("Review"),
          content: "@plugin/review",
          start: 4,
          end: 18,
        },
      ],
    }
    const state = createPromptState(Schema.decodeUnknownSync(PromptDraft)(draft))
    expect(state.store[0].prompt).toEqual([
      { type: "text", content: "Use ", start: 0, end: 4 },
      {
        type: "skill",
        id: Skill.ID.make("plugin/review"),
        name: Skill.Name.make("Review"),
        content: "@plugin/review",
        start: 4,
        end: 18,
      },
      { type: "text", content: " here", start: 18, end: 23 },
    ])
    const captured = state.capture()
    state.store[1](
      produce((value) => {
        const skill = value.prompt[1]
        if (skill.type !== "skill") throw new Error("Expected a skill")
        skill.content = "changed"
      }),
    )
    expect(captured.references).toEqual([
      {
        type: "skill",
        id: Skill.ID.make("plugin/review"),
        name: Skill.Name.make("Review"),
        content: "@plugin/review",
        start: 4,
        end: 18,
      },
    ])
    expect(draft.references[0].content).toBe("@plugin/review")
    state.reset()
    state.restore(captured)
    expect(state.capture()).toEqual(captured)
  })
  test("initializes and captures an isolated draft", () => {
    const initial = { prompt: "hello", attachments: [attachment("first")] }
    const state = createPromptState(initial)

    expect(state.current()).toBe("hello")
    expect(state.capture()).toEqual(initial)
    expect(state.capture()).not.toBe(initial)
    expect(state.capture().attachments).not.toBe(initial.attachments)
  })

  test("updates prompt content and attachments together", () => {
    const changes: unknown[] = []
    const state = createPromptState(undefined, (draft) => changes.push(draft))

    state.set("explain this")
    state.addAttachment(attachment("first"))
    state.removeAttachment("first")

    expect(state.capture()).toEqual({ prompt: "explain this", attachments: [] })
    expect(changes).toEqual([
      { prompt: "explain this", attachments: [] },
      { prompt: "explain this", attachments: [attachment("first")] },
      { prompt: "explain this", attachments: [] },
    ])

    state.reset()
    expect(state.dirty()).toBe(false)
    expect(changes.at(-1)).toEqual({ prompt: "", attachments: [] })
  })

  test("exposes the shared v2 store without changing the persisted draft shape", () => {
    const state = createPromptState({ prompt: "hello", attachments: [attachment("first")] })

    expect(state.store[0].prompt).toEqual([
      { type: "text", content: "hello", start: 0, end: 5 },
      {
        type: "image",
        id: "first",
        filename: "first.png",
        sourcePath: undefined,
        mime: "image/png",
        blob: {
          id: "data:image/png;base64,first",
          url: "data:image/png;base64,first",
        },
      },
    ])

    state.store[1]("prompt", (parts) =>
      parts.map((part) => {
        if (part.type === "text") return { ...part, content: "updated", end: 7 }
        if (part.type === "image") return { ...part, blob: { ...part.blob, id: "sha256:first" } }
        return part
      }),
    )
    state.persist()

    expect(state.capture()).toEqual({
      prompt: "updated",
      attachments: [{ ...attachment("first"), blobID: "sha256:first" }],
    })
  })
})
