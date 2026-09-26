import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { ComposerPrompt } from "../types"
import { createComposerAttachments } from "./attachments"

function fixture(
  store: (file: File) => Promise<{ id: string; url: string }>,
  overrides: Partial<Parameters<typeof createComposerAttachments>[0]> = {},
) {
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
      ...overrides,
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
      else delete (globalThis as { crypto?: typeof globalThis.crypto }).crypto
      input.dispose()
    }
  })
})

function dropFixture() {
  const inside = new EventTarget()
  const sibling = new EventTarget()
  const outside = new EventTarget()
  const root = { contains: (target: unknown) => target === inside || target === sibling } as HTMLElement
  let blocked = false
  let mounted = true
  let drag: "image" | "@mention" | null = null
  const store = mock(async () => ({ id: "notes", url: "data:text/plain;base64,bm90ZXM=" }))
  const input = fixture(store, {
    editor: () => ({}) as HTMLElement,
    dropTarget: () => (mounted ? root : undefined),
    isDialogActive: () => blocked,
    setDraggingType: (value) => (drag = value),
  })
  const event = (target = inside, types = ["Files"], files: File[] = []): DragEvent =>
    ({
      target,
      dataTransfer: { types, files, getData: () => "" },
      preventDefault: mock(() => {}),
    }) as unknown as DragEvent
  return {
    ...input,
    inside,
    sibling,
    outside,
    store,
    event,
    drag: () => drag,
    block: () => (blocked = true),
    unmount: () => (mounted = false),
  }
}

describe("embedded attachment drops", () => {
  test("accepts a tree drag and inserts a workspace reference without uploading bytes", async () => {
    const addPart = mock(() => true)
    const store = mock(async () => ({ id: "unused", url: "unused" }))
    const dragging = mock(() => {})
    const input = fixture(store, { directory: () => "/workspace/agent7777", addPart, setDraggingType: dragging })
    const event = {
      dataTransfer: {
        types: ["application/x-opencode-file", "text/plain", "text/uri-list"],
        getData: (type: string) => (type === "text/plain" ? "file:docs/a #1.md" : ""),
        files: [],
      },
      preventDefault: mock(() => {}),
    } as unknown as DragEvent
    try {
      input.attachments.handleDragOver(event)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
      expect(dragging).toHaveBeenLastCalledWith("@mention")
      await input.attachments.handleDrop(event)
      expect(addPart).toHaveBeenCalledTimes(1)
      expect(addPart).toHaveBeenCalledWith({
        type: "file",
        path: "docs/a #1.md",
        content: "@docs/a #1.md",
        start: 0,
        end: 0,
        url: "file:///workspace/agent7777/docs/a%20%231.md",
      })
      expect(store).not.toHaveBeenCalled()
      expect(dragging).toHaveBeenLastCalledWith(null)
    } finally {
      input.dispose()
    }
  })

  test("admits file drags only inside the mount and leaves text dragging to the browser", () => {
    const input = dropFixture()
    try {
      for (const event of [input.event(input.outside), input.event(input.inside, ["text/plain"])]) {
        input.attachments.handleDragOver(event)
        expect(event.preventDefault).not.toHaveBeenCalled()
        expect(input.drag()).toBeNull()
      }
      const event = input.event()
      input.attachments.handleDragOver(event)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
      expect(input.drag()).toBe("image")
    } finally {
      input.dispose()
    }
  })

  test("keeps feedback between descendants and clears it on leaving the mount or window", () => {
    const input = dropFixture()
    try {
      input.attachments.handleDragOver(input.event())
      input.attachments.handleDragLeave({ relatedTarget: input.sibling } as unknown as DragEvent)
      expect(input.drag()).toBe("image")
      input.attachments.handleDragLeave({ relatedTarget: input.outside } as unknown as DragEvent)
      expect(input.drag()).toBeNull()
      input.attachments.handleDragOver(input.event())
      input.attachments.handleDragLeave({ relatedTarget: null } as DragEvent)
      expect(input.drag()).toBeNull()
    } finally {
      input.dispose()
    }
  })

  test("attaches an in-mount drop exactly once and clears feedback", async () => {
    const input = dropFixture()
    try {
      input.attachments.handleDragOver(input.event())
      const event = input.event(input.inside, ["Files"], [new File(["notes"], "notes.txt", { type: "text/plain" })])
      await input.attachments.handleDrop(event)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
      expect(input.store).toHaveBeenCalledTimes(1)
      expect(input.prompt()).toEqual([
        { type: "text", content: "draft", start: 0, end: 5 },
        {
          type: "image",
          id: expect.any(String),
          filename: "notes.txt",
          sourcePath: undefined,
          mime: "text/plain",
          blob: { id: "notes", url: "data:text/plain;base64,bm90ZXM=" },
        },
      ])
      expect(input.drag()).toBeNull()
    } finally {
      input.dispose()
    }
  })

  test("leaves ordinary text drops inside the mount to native editing", async () => {
    const input = dropFixture()
    try {
      const event = input.event(input.inside, ["text/plain"])
      await input.attachments.handleDrop(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(input.store).not.toHaveBeenCalled()
      expect(input.prompt()).toEqual([{ type: "text", content: "draft", start: 0, end: 5 }])
    } finally {
      input.dispose()
    }
  })

  test.each(["outside", "disabled", "unmounted"] as const)(
    "ignores %s drops without touching the draft",
    async (kind) => {
      const input = dropFixture()
      try {
        input.attachments.handleDragOver(input.event())
        if (kind === "disabled") input.block()
        if (kind === "unmounted") input.unmount()
        const target = kind === "outside" ? input.outside : input.inside
        const event = input.event(target, ["Files"], [new File(["notes"], "notes.txt")])
        await input.attachments.handleDrop(event)
        expect(event.preventDefault).not.toHaveBeenCalled()
        expect(input.store).not.toHaveBeenCalled()
        expect(input.prompt()).toEqual([{ type: "text", content: "draft", start: 0, end: 5 }])
        expect(input.drag()).toBeNull()
        input.attachments.handleDragOver(input.event(target))
        expect(input.drag()).toBeNull()
      } finally {
        input.dispose()
      }
    },
  )
})
