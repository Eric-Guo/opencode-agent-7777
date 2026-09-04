import { describe, expect, test } from "bun:test"
import { createComposerEditorActions } from "./editor/actions"
import { createPromptState } from "./state"
import { createComposerSubmission } from "./submission-state"

function draft() {
  return {
    prompt: "  explain this\n",
    attachments: [
      {
        id: "image",
        filename: "image.png",
        sourcePath: "/repo/image.png",
        mime: "image/png",
        url: "data:image/png;base64,aGVsbG8=",
        blobID: "image-blob",
      },
    ],
  }
}

describe("composer submission state", () => {
  test("captures and restores an isolated draft including attachment metadata", () => {
    const changes: unknown[] = []
    const initial = draft()
    const target = createPromptState(initial, (value) => changes.push(value))
    const submission = createComposerSubmission({ target })
    initial.attachments[0].filename = "changed.png"

    submission.clear()
    expect(target.capture()).toEqual({ prompt: "", attachments: [] })
    const restored = submission.restore()
    expect(restored).toBeDefined()
    restored!.target.restore(restored!.prompt)

    expect(target.capture()).toEqual(draft())
    expect(changes).toEqual([{ prompt: "", attachments: [] }, draft()])
    target.store[1]("prompt", 1, (part) => (part.type === "image" ? { ...part, filename: "edited.png" } : part))
    expect(submission.prompt).toEqual(draft())
  })

  test("does not restore before clearing", () => {
    const target = createPromptState(draft())
    expect(createComposerSubmission({ target }).restore()).toBeUndefined()
  })

  test.each(["follow-up", "", "   "])("preserves a subsequent editor change to %j", (text) => {
    const target = createPromptState(draft())
    const submission = createComposerSubmission({ target })
    submission.clear()
    createComposerEditorActions(target.store, target.persist).setText(text)

    expect(submission.restore()).toBeUndefined()
    expect(target.capture()).toEqual({ prompt: text, attachments: [] })
  })

  test("preserves attachments added while sending", () => {
    const target = createPromptState(draft())
    const submission = createComposerSubmission({ target })
    submission.clear()
    target.addAttachment(draft().attachments[0])

    expect(submission.restore()).toBeUndefined()
    expect(target.capture()).toEqual({ prompt: "", attachments: draft().attachments })
  })

  test("preserves nested edits that retain the cleared store reference", () => {
    const target = createPromptState(draft())
    const submission = createComposerSubmission({ target })
    submission.clear()
    const cleared = target.store[0].prompt
    target.store[1]("prompt", 0, (part) => (part.type === "text" ? { ...part, content: "follow-up" } : part))

    expect(target.store[0].prompt).toBe(cleared)
    expect(submission.restore()).toBeUndefined()
    expect(target.current()).toBe("follow-up")
  })

  test("does not restore into a reset session draft", () => {
    const target = createPromptState(draft())
    const submission = createComposerSubmission({ target })
    submission.clear()
    target.restore()

    expect(submission.restore()).toBeUndefined()
    expect(target.capture()).toEqual({ prompt: "", attachments: [] })
  })
})
