import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { ComposerPrompt } from "../types"
import { createComposerAttachments } from "./attachments"

function fixture(store: (file: File) => Promise<{ id: string; url: string }>) {
  let prompt: ComposerPrompt = [{ type: "text", content: "draft", start: 0, end: 5 }]
  const duplicate = mock(() => {})
  const target = {
    prompt: {
      current: () => prompt,
      cursor: () => 5,
      set: (value: ComposerPrompt) => (prompt = value),
    },
    cursor: 5,
  }
  const result = createRoot((dispose) => ({
    dispose,
    attachments: createComposerAttachments({
      directory: () => "",
      isDialogActive: () => false,
      warn() {},
      duplicate,
      onError(error) {
        throw error
      },
      capture: () => target.prompt,
      editor: () => undefined,
      focusEditor() {},
      addPart: () => false,
      setDraggingType() {},
      store,
    }),
  }))
  return { ...result, target, duplicate, prompt: () => prompt }
}

describe("composer attachments", () => {
  test("keeps supplied durable blob references and rejects a duplicate without changing the draft", async () => {
    const store = mock(async () => ({ id: "content-hash", url: "data:text/plain;base64,bm90ZXM=" }))
    const input = fixture(store)
    try {
      const file = new File(["notes"], "notes.txt", { type: "text/plain" })
      await input.attachments.addAttachments([file], true, input.target)
      const saved = structuredClone(input.prompt())
      expect(saved[1]).toMatchObject({
        type: "image",
        filename: "notes.txt",
        mime: "text/plain",
        blob: { id: "content-hash", url: "data:text/plain;base64,bm90ZXM=" },
      })
      await input.attachments.addAttachments([file], true, input.target)
      expect(input.prompt()).toEqual(saved)
      expect(input.duplicate).toHaveBeenCalledTimes(1)
      expect(store).toHaveBeenCalledTimes(2)
    } finally {
      input.dispose()
    }
  })

  test("adds attachments when the browser does not expose randomUUID", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
    const input = fixture(async () => ({ id: "content-hash", url: "data:text/plain;base64,bm90ZXM=" }))
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} })
    try {
      await input.attachments.addAttachments([new File(["notes"], "notes.txt")], true, input.target)
      expect(input.prompt()).toHaveLength(2)
      expect(input.prompt()[1]).toMatchObject({ type: "image", id: expect.any(String), filename: "notes.txt" })
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor)
      else Reflect.deleteProperty(globalThis, "crypto")
      input.dispose()
    }
  })
})
