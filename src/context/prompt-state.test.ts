import { describe, expect, test } from "bun:test"
import { createPromptState, type PromptAttachment } from "./prompt-state"

const attachment = (id: string): PromptAttachment => ({
  id,
  filename: `${id}.png`,
  mime: "image/png",
  url: `data:image/png;base64,${id}`,
})

describe("compact prompt state", () => {
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
})
