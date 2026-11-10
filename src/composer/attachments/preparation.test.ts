import { afterEach, beforeEach, expect, jest, mock, test } from "bun:test"
import { createComputed, createRoot, createSignal } from "solid-js"
import { createPromptState } from "@/composer/state"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { installDOM } from "@/test/dom"
import { createComposerAttachments, type ComposerAttachmentConfig } from "./attachments"

browserSuite(import.meta.path, () => {
  let cleanup: () => void
  const disposers: (() => void)[] = []
  beforeEach(() => (cleanup = installDOM()))
  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    cleanup()
    jest.useRealTimers()
  })
  const file = (name = "notes.txt") => new File(["notes"], name, { type: "text/plain" })
  const blob = (id = "notes") => ({ id, url: "data:text/plain;base64,bm90ZXM=" })

  function fixture(options: Partial<ComposerAttachmentConfig> = {}) {
    return createRoot((dispose) => {
      disposers.push(dispose)
      const draft = createPromptState({ prompt: "draft", attachments: [] })
      const [identity, setIdentity] = createSignal<object>({})
      const editor = document.createElement("div")
      document.body.append(editor)
      const onError = mock(() => {})
      const done = mock(() => {})
      const warn = mock(() => {})
      const duplicate = mock(() => {})
      const attachments = createComposerAttachments({
        scope: draft.scope,
        identity,
        directory: () => "",
        dropTarget: () => editor,
        isDialogActive: () => false,
        onError,
        warn,
        duplicate,
        capture: () => ({
          current: () => draft.store[0].prompt,
          cursor: () => draft.store[0].cursor,
          set: (prompt, cursor) => draft.store[1]({ prompt, cursor }),
        }),
        editor: () => editor,
        focusEditor() {},
        addPart: () => false,
        setDraggingType() {},
        store: async () => blob(),
        ...options,
      })
      return { draft, attachments, editor, onError, done, warn, duplicate, dispose, identity, setIdentity }
    })
  }

  test.each(
    ["restore", "reset", "identity", "dispose", "cancel"].flatMap((exit) =>
      ["inline", "audio"].map((kind) => ({ exit, kind })),
    ),
  )("$exit settles an abort-ignoring $kind read immediately and prevents late draft writes", async ({ exit, kind }) => {
    const read = Promise.withResolvers<string>()
    const started = Promise.withResolvers<void>()
    let signal: AbortSignal | undefined
    const input = fixture({
      store: (_file, value) => {
        signal = value
        started.resolve()
        return read.promise.then(() => blob())
      },
      destination: () => ({
        upload: () => {
          started.resolve()
          return read.promise
        },
      }),
    })
    const attachment = kind === "audio" ? new File(["ID3\0binary"], "record.mp3", { type: "audio/mpeg" }) : file()
    const pending = input.attachments.addAttachments([attachment], true, undefined, input.done)
    expect(input.attachments.preparing()).toBe(true)
    await started.promise
    if (exit === "restore") input.draft.restore({ prompt: "replacement draft", attachments: [] })
    if (exit === "reset") input.draft.reset()
    if (exit === "identity") {
      const original = input.identity()
      input.setIdentity({})
      input.setIdentity(original)
    }
    if (exit === "dispose") input.dispose()
    if (exit === "cancel") input.attachments.cancelPending()
    expect(input.attachments.preparing()).toBe(false)
    await expect(pending).resolves.toBeUndefined()
    if (kind === "inline") expect(signal?.aborted).toBe(true)
    read.resolve("/server/tmp/uploads/record.mp3")
    await read.promise
    await Promise.resolve()
    expect(input.draft.capture()).toEqual({
      prompt: exit === "reset" ? "" : exit === "restore" ? "replacement draft" : "draft",
      attachments: [],
    })
    expect(input.onError).not.toHaveBeenCalled()
    expect(input.done).not.toHaveBeenCalled()
  })

  test("audio preparation retains edits and inserts its path at the latest caret", async () => {
    const upload = Promise.withResolvers<string>()
    const started = Promise.withResolvers<void>()
    const input = fixture({
      destination: () => ({
        upload: () => {
          started.resolve()
          return upload.promise
        },
      }),
    })
    const pending = input.attachments.addAttachments([new File(["ID3\0binary"], "record.mp3", { type: "audio/mpeg" })])
    await started.promise
    expect(input.attachments.preparing()).toBe(true)
    input.draft.set("edited while uploading ")
    upload.resolve("/server/tmp/uploads/record.mp3")
    await pending
    expect(input.attachments.preparing()).toBe(false)
    expect(input.draft.current()).toBe("edited while uploading @/server/tmp/uploads/record.mp3 ")
    expect(input.draft.attachments()).toEqual([])
    expect(input.draft.store[0].prompt.filter((part) => part.type === "file").map((part) => part.path)).toEqual([
      "/server/tmp/uploads/record.mp3",
    ])
    expect(input.onError).not.toHaveBeenCalled()
  })

  test("completed files survive a batch failure while other gestures and later edits finish normally", async () => {
    const read = Promise.withResolvers<ReturnType<typeof blob>>()
    const started = Promise.withResolvers<void>()
    const error = new Error("unreadable file")
    const input = fixture({
      store: async (value) => {
        if (value.name === "slow.txt") {
          started.resolve()
          return read.promise
        }
        if (value.name === "bad.txt") throw error
        return blob(value.name)
      },
    })
    const slow = input.attachments.addAttachments([file("slow.txt")])
    await started.promise
    await input.attachments.addAttachments([file("ready.txt"), file("bad.txt"), file("skipped.txt")])
    expect(input.attachments.preparing()).toBe(true)
    expect(input.onError).toHaveBeenCalledTimes(1)
    expect(input.onError).toHaveBeenCalledWith(error)
    input.draft.set("edited while reading")
    read.resolve(blob("slow"))
    await slow
    expect(input.attachments.preparing()).toBe(false)
    expect(input.draft.current()).toBe("edited while reading")
    expect(input.draft.store[0].cursor).toBe(20)
    expect(input.draft.attachments().map((item) => item.filename)).toEqual(["ready.txt", "slow.txt"])
  })

  test("the inactivity deadline renews after each file and a timeout permits a new attempt", async () => {
    jest.useFakeTimers()
    const first = Promise.withResolvers<ReturnType<typeof blob>>()
    const second = Promise.withResolvers<ReturnType<typeof blob>>()
    const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    let calls = 0
    const input = fixture({
      store: () => {
        entered[calls]?.resolve()
        return calls++ === 0 ? first.promise : second.promise
      },
    })
    const pending = input.attachments.addAttachments([file("one.txt"), file("two.txt")])
    await entered[0].promise
    jest.advanceTimersByTime(59_000)
    first.resolve(blob("one"))
    await entered[1].promise
    jest.advanceTimersByTime(59_000)
    expect(input.attachments.preparing()).toBe(true)
    jest.advanceTimersByTime(1_000)
    await expect(pending).resolves.toBeUndefined()
    expect(input.attachments.preparing()).toBe(false)
    expect(input.onError).toHaveBeenCalledTimes(1)
    expect(input.onError).toHaveBeenCalledWith(new Error("Attachment preparation timed out. Please try again."))
    second.resolve(blob("two"))
    await second.promise
    await Promise.resolve()
    expect(input.draft.attachments().map((item) => item.filename)).toEqual(["one.txt"])
    await input.attachments.addAttachments([file("fresh.txt")])
    expect(input.draft.attachments().map((item) => item.filename)).toEqual(["one.txt", "fresh.txt"])
  })

  test("browser selection retains its opening scope and cancellation restores focus only for the current picker", async () => {
    jest.useFakeTimers()
    const store = mock(async () => blob())
    const input = fixture({ store })
    const open = mock(() => {})
    input.attachments.pick(open, input.done)
    input.attachments.pick(open, input.done)
    expect(open).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(120_000)
    expect(input.attachments.preparing()).toBe(false)
    expect(input.onError).not.toHaveBeenCalled()
    input.draft.reset()
    await input.attachments.acceptPickedFiles([file()])
    expect(store).not.toHaveBeenCalled()
    expect(input.done).not.toHaveBeenCalled()
    input.attachments.pick(() => {}, input.done)
    input.attachments.cancelPicker()
    expect(input.done).toHaveBeenCalledTimes(1)
    input.attachments.pick(() => {}, input.done)
    await input.attachments.acceptPickedFiles([file()])
    expect(input.draft.attachments()).toHaveLength(1)
    expect(input.done).toHaveBeenCalledTimes(2)
  })

  test("retiring a native clipboard lookup settles it without publishing a late image or error", async () => {
    const read = Promise.withResolvers<File | null>()
    const input = fixture({ readClipboardImage: () => read.promise })
    const pending = input.attachments.handlePaste({
      clipboardData: { items: [], getData: () => "" },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as ClipboardEvent)
    expect(input.attachments.preparing()).toBe(true)
    input.draft.restore({ prompt: "other", attachments: [] })
    await pending
    read.reject(new Error("late clipboard failure"))
    await Promise.resolve()
    expect(input.onError).not.toHaveBeenCalled()
    expect(input.draft.capture()).toEqual({ prompt: "other", attachments: [] })
  })

  test("synchronous disposal on picker admission never opens the file input", () => {
    const input = fixture()
    const open = mock(() => {})
    let watching = false
    createRoot((dispose) => {
      disposers.push(dispose)
      createComputed(() => {
        input.attachments.preparing()
        if (watching) input.dispose()
      })
    })
    watching = true
    input.attachments.pick(open)
    expect(open).not.toHaveBeenCalled()
  })

  test("synchronous disposal on preparation admission starts no file work", async () => {
    const store = mock(async () => blob())
    const input = fixture({ store })
    createRoot((dispose) => {
      disposers.push(dispose)
      createComputed(() => {
        if (input.attachments.preparing()) input.dispose()
      })
    })
    await input.attachments.addAttachments([file()])
    expect(store).not.toHaveBeenCalled()
    expect(input.attachments.preparing()).toBe(false)
  })
})
