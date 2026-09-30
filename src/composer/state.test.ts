import { describe, expect, test } from "bun:test"
import { Skill } from "@opencode/schema/skill"
import { Schema } from "effect"
import { produce } from "solid-js/store"
import { PromptDraft } from "./schema"
import { createPromptState, type PromptAttachment } from "./state"

const attachment = (id: string): PromptAttachment => ({
  id,
  filename: `${id}.png`,
  mime: "image/png",
  url: `data:image/png;base64,${id}`,
})

describe("prompt state", () => {
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
