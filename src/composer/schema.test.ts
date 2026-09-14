import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { createStore } from "solid-js/store"
import { PromptDraft } from "./schema"

const decode = Schema.decodeUnknownSync(PromptDraft)

function attachment() {
  return { id: "image", filename: "image.png", mime: "image/png", url: "data:image/png;base64,YQ==" }
}

describe("composer persistence schemas", () => {
  test("preserves the existing draft format and attachment metadata through a round trip", () => {
    const draft = {
      prompt: "  explain this\n",
      attachments: [attachment(), { ...attachment(), id: "second", sourcePath: "/images/image.png", blobID: "hash" }],
    }
    const value = decode(draft)
    expect(value).toEqual(draft)
    expect(Schema.encodeSync(PromptDraft)(value)).toEqual(draft)
    expect(decode(Schema.encodeSync(PromptDraft)(value))).toEqual(draft)
  })

  test("recovers fields and individual attachments without losing healthy siblings", () => {
    expect(
      decode({
        prompt: 42,
        attachments: [
          null,
          { ...attachment(), id: false },
          { ...attachment(), filename: null },
          { ...attachment(), mime: false },
          { ...attachment(), url: null },
          attachment(),
          { ...attachment(), id: "second", sourcePath: false, blobID: 42, extra: "ignored" },
          { ...attachment(), id: "third", sourcePath: "", blobID: "" },
        ],
        extra: "ignored",
      }),
    ).toEqual({
      prompt: "",
      attachments: [attachment(), { ...attachment(), id: "second" }, { ...attachment(), id: "third" }],
    })
    expect(decode({ prompt: "keep me", attachments: false })).toEqual({ prompt: "keep me", attachments: [] })
    expect(decode({ attachments: [attachment()] })).toEqual({ prompt: "", attachments: [attachment()] })
  })

  test("rejects non-object drafts", () => {
    for (const value of [null, false, 42, "draft", []]) {
      expect(Option.isNone(Schema.decodeUnknownOption(PromptDraft)(value))).toBe(true)
    }
  })

  test("Solid store edits cannot mutate the decoded source or later fallback drafts", () => {
    const initial = { prompt: "hello", attachments: [attachment()] }
    const [state, setState] = createStore(decode(initial))
    setState("attachments", 0, "filename", "changed.png")
    expect(state.attachments[0].filename).toBe("changed.png")
    expect(initial).toEqual({ prompt: "hello", attachments: [attachment()] })

    const [empty, setEmpty] = createStore(decode({}))
    setEmpty("attachments", [attachment()])
    setEmpty("prompt", "changed")
    expect(empty.prompt).toBe("changed")
    expect(decode({})).toEqual({ prompt: "", attachments: [] })
    expect(decode({ prompt: false, attachments: false })).toEqual({ prompt: "", attachments: [] })
  })
})
