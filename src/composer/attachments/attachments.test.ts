import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import { ACCEPTED_FILE_TYPES } from "@/runtime/platform/file-picker"
import { installDOM } from "@/test/dom"
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
  test.each([
    { name: "unknown", type: "IMAGE/PNG; charset=binary", bytes: "\0", mime: "image/png" },
    { name: "photo.JPG", type: "", bytes: "\0", mime: "image/jpeg" },
    { name: "photo.jpeg", type: "application/octet-stream", bytes: "\0", mime: "image/jpeg" },
    { name: "image.gif", type: "", bytes: "\0", mime: "image/gif" },
    { name: "image.webp", type: "", bytes: "\0", mime: "image/webp" },
    { name: "document.PDF", type: "", bytes: "\0", mime: "application/pdf" },
    { name: "document", type: "application/pdf", bytes: "\0", mime: "application/pdf" },
    { name: "photo.jpg", type: "text/plain", bytes: "\0", mime: "text/plain" },
    { name: "data", type: "application/json", bytes: "\0", mime: "text/plain" },
    { name: "data", type: "application/vnd.example+json", bytes: "\0", mime: "text/plain" },
    { name: "data", type: "application/x-yaml", bytes: "\0", mime: "text/plain" },
    { name: "drawing.svg", type: "image/svg+xml", bytes: "<svg/>", mime: "text/plain" },
    { name: "script", type: "", bytes: "hello\tworld\n", mime: "text/plain" },
    { name: "empty", type: "", bytes: "", mime: "text/plain" },
    { name: "unknown.bin", type: "application/octet-stream", bytes: "readable", mime: "text/plain" },
    { name: "unknown.bin", type: "", bytes: "\x01\x02\x037890abc", mime: "text/plain" },
    { name: "unknown.bin", type: "", bytes: "\x01\x02\x03abc", mime: undefined },
    { name: "notes.txt", type: "", bytes: "hidden\0binary", mime: undefined },
    { name: "photo.png", type: "application/x-binary", bytes: "\0", mime: undefined },
    { name: "large", type: "", bytes: "a".repeat(4096) + "\0", mime: "text/plain" },
  ])("preserves attachment admission for $name ($type)", async ({ name, type, bytes, mime }) => {
    const store = mock(async () => ({ id: "hash", url: "data:application/octet-stream;base64,YQ==" }))
    const warn = mock(() => {})
    const input = fixture(store, { warn })
    try {
      await input.attachments.addAttachments([new File([bytes], name, { type })], true, input.target)
      expect(store).toHaveBeenCalledTimes(mime ? 1 : 0)
      expect(warn).toHaveBeenCalledTimes(mime ? 0 : 1)
      expect(input.prompt()).toHaveLength(mime ? 2 : 1)
      expect(input.prompt()[0]).toEqual({ type: "text", content: "draft", start: 0, end: 5 })
      if (mime) expect(input.prompt()[1]).toMatchObject({ type: "image", filename: name, mime })
    } finally {
      input.dispose()
    }
  })

  test.each([
    { selection: "caret", expected: 10 },
    { selection: "forward", expected: 3 },
    { selection: "backward", expected: 3 },
    { selection: "stored", expected: 2 },
    { selection: "outside", expected: 0 },
    { selection: "missing", expected: 0 },
  ])("captures the attachment insertion position for $selection selections", async ({ selection, expected }) => {
    const cleanup = installDOM()
    const editor = document.createElement("div")
    editor.innerHTML = 'a\u200B<br><span data-mention="file" contenteditable="false">@file</span><br>z'
    document.body.append(editor)
    const selected = window.getSelection()!
    if (selection !== "missing") {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      if (selection === "forward" || selection === "backward") range.setStart(editor, 2)
      if (selection === "outside") range.selectNodeContents(document.body)
      selected.addRange(range)
      if (selection === "backward") selected.setBaseAndExtent(editor, 5, editor, 2)
    }
    let cursor: number | undefined
    const input = fixture(async () => ({ id: "hash", url: "data:text/plain;base64,YQ==" }), {
      editor: () => editor,
      capture: () => ({
        current: () => [{ type: "text", content: "a\u200B\n@file\nz", start: 0, end: 10 }],
        cursor: () => (selection === "stored" ? 2 : undefined),
        set: (_prompt, value) => (cursor = value),
      }),
    })
    try {
      await input.attachments.addAttachments([new File(["a"], "notes.txt")])
      expect(cursor).toBe(expected)
    } finally {
      input.dispose()
      cleanup()
    }
  })

  test.each(["picker", "input", "paste", "drop"] as const)(
    "%s reports read failures once and retains attachments already added",
    async (source) => {
      const error = new Error("Could not read attachment")
      const files = [new File(["notes"], "notes.txt"), new File(["broken"], "broken.txt")]
      const onError = mock(() => {})
      const done = mock(() => {})
      const input = fixture(
        async (file) => {
          if (file.name === "broken.txt") throw error
          return { id: "notes", url: "data:text/plain;base64,bm90ZXM=" }
        },
        {
          editor: () => ({}) as HTMLElement,
          onError,
          picker: async (_options, onFile) => {
            for (const file of files) await onFile(file)
          },
        },
      )
      try {
        if (source === "picker") await input.attachments.pick(() => {}, done)
        if (source === "input") await input.attachments.addAttachments(files)
        if (source === "paste")
          await input.attachments.handlePaste({
            clipboardData: { items: files.map((file) => ({ kind: "file", getAsFile: () => file })) },
            preventDefault() {},
            stopPropagation() {},
          } as unknown as ClipboardEvent)
        if (source === "drop")
          await input.attachments.handleDrop({
            dataTransfer: { files, getData: () => "" },
            preventDefault() {},
          } as unknown as DragEvent)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(error)
        expect(done).not.toHaveBeenCalled()
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
      } finally {
        input.dispose()
      }
    },
  )

  test("preserves supported formats across picker calls even when a picker mutates its options", () => {
    const expected = (
      "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/*,application/json,application/ld+json," +
      "application/toml,application/x-toml,application/x-yaml,application/xml,application/yaml," +
      ".c,.cc,.cjs,.conf,.cpp,.css,.csv,.cts,.env,.go,.gql,.graphql,.h,.hh,.hpp,.htm,.html,.ini,.java,.js,.json," +
      ".jsx,.log,.md,.mdx,.mjs,.mts,.py,.rb,.rs,.sass,.scss,.sh,.sql,.toml,.ts,.tsx,.txt,.xml,.yaml,.yml,.zsh"
    ).split(",")
    const filters: string[][] = []
    const input = fixture(async () => ({ id: "unused", url: "unused" }), {
      picker: async (options) => {
        filters.push([...options.accept!])
        options.accept!.splice(0)
      },
    })
    const fallback = mock(() => {})
    try {
      input.attachments.pick(fallback)
      input.attachments.pick(fallback)
      expect(filters).toEqual([expected, expected])
      expect(ACCEPTED_FILE_TYPES).toEqual(expected)
      expect(fallback).not.toHaveBeenCalled()
      expect(input.prompt()).toEqual([{ type: "text", content: "draft", start: 0, end: 5 }])
    } finally {
      input.dispose()
    }
  })

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
