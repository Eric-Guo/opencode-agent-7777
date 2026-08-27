import { describe, expect, mock, test } from "bun:test"
import { createPlatformAttachments, isAgent7777Enabled, isElectronUserAgent } from "./platform-bridge"
import { ACCEPTED_FILE_EXTENSIONS } from "./file-picker"

describe("platform attachments", () => {
  test("keeps the browser picker fallback when native file support is absent or incomplete", () => {
    const openFilePicker = mock(async () => null)

    expect(createPlatformAttachments({}).openAttachmentPickerDialog).toBeUndefined()
    expect(createPlatformAttachments({ openFilePicker }).openAttachmentPickerDialog).toBeUndefined()
    expect(openFilePicker).not.toHaveBeenCalled()
  })

  test("reads picked files sequentially, remembers their paths, and releases the picker token", async () => {
    const calls: string[] = []
    const openFilePicker = mock(async () => ({
      token: "picked-files",
      files: [
        { path: "/project/one.txt", name: "one.txt", size: 3 },
        { path: "/project/two.txt", name: "two.txt", size: 3 },
      ],
    }))
    const platform = createPlatformAttachments({
      openFilePicker,
      async readPickedFile(token, path) {
        calls.push(`read:${token}:${path}`)
        return new TextEncoder().encode(path.endsWith("one.txt") ? "one" : "two").buffer
      },
      async releasePickedFiles(token) {
        calls.push(`release:${token}`)
      },
    })

    await platform.openAttachmentPickerDialog?.({ multiple: true, defaultPath: "/project" }, async (file) => {
      calls.push(`file:${platform.getPathForFile?.(file)}:${await file.text()}`)
    })

    expect(openFilePicker).toHaveBeenCalledWith({
      multiple: true,
      defaultPath: "/project",
      extensions: ACCEPTED_FILE_EXTENSIONS,
    })
    expect(calls).toEqual([
      "read:picked-files:/project/one.txt",
      "file:/project/one.txt:one",
      "read:picked-files:/project/two.txt",
      "file:/project/two.txt:two",
      "release:picked-files",
    ])
  })

  test.each(["read", "consume"])("releases picked files when %s fails", async (stage) => {
    const error = new Error("attachment failed")
    const releasePickedFiles = mock(async () => {})
    const platform = createPlatformAttachments({
      async openFilePicker() {
        return { token: "picked-files", files: [{ path: "/project/one.txt", name: "one.txt", size: 3 }] }
      },
      async readPickedFile() {
        if (stage === "read") throw error
        return new ArrayBuffer(3)
      },
      releasePickedFiles,
    })

    await expect(
      platform.openAttachmentPickerDialog!({}, async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(releasePickedFiles).toHaveBeenCalledTimes(1)
    expect(releasePickedFiles).toHaveBeenCalledWith("picked-files")
  })

  test("does not read or release files after cancelling the picker", async () => {
    const readPickedFile = mock(async () => new ArrayBuffer(0))
    const releasePickedFiles = mock(async () => {})
    const onFile = mock(async () => {})
    const platform = createPlatformAttachments({
      openFilePicker: async () => null,
      readPickedFile,
      releasePickedFiles,
    })

    await platform.openAttachmentPickerDialog?.({}, onFile)

    expect(readPickedFile).not.toHaveBeenCalled()
    expect(releasePickedFiles).not.toHaveBeenCalled()
    expect(onFile).not.toHaveBeenCalled()
  })

  test("resolves native paths for dropped files without a native picker", () => {
    const platform = createPlatformAttachments({ getPathForFile: (file) => `/project/${file.name}` })

    expect(platform.getPathForFile?.(new File(["one"], "one.txt"))).toBe("/project/one.txt")
  })

  test("converts a native clipboard image to a PNG file", async () => {
    const platform = createPlatformAttachments({
      readClipboardImage: async () => ({ buffer: new Uint8Array([1, 2, 3]).buffer, width: 1, height: 1 }),
    })

    const file = await platform.readClipboardImage?.()

    expect(file?.type).toBe("image/png")
    expect(file?.name).toMatch(/^pasted-image-\d+\.png$/)
    expect(new Uint8Array(await file!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  test("treats missing or failed clipboard images as empty", async () => {
    const empty = createPlatformAttachments({ readClipboardImage: async () => null })
    const failed = createPlatformAttachments({
      async readClipboardImage() {
        throw new Error("clipboard unavailable")
      },
    })

    expect(createPlatformAttachments({}).readClipboardImage).toBeUndefined()
    expect(await empty.readClipboardImage?.()).toBeNull()
    expect(await failed.readClipboardImage?.()).toBeNull()
  })
})

describe("agent7777 environment gate", () => {
  test("enables Electron when Electron-only activation is enabled", () => {
    expect(isAgent7777Enabled("Mozilla/5.0 Electron/40.0.0", true)).toBe(true)
  })

  test("disables a browser when Electron-only activation is enabled", () => {
    expect(isAgent7777Enabled("Mozilla/5.0 Chrome/150.0.0.0", true)).toBe(false)
  })

  test("enables a browser when Electron-only activation is disabled", () => {
    expect(isAgent7777Enabled("Mozilla/5.0 Chrome/150.0.0.0", false)).toBe(true)
  })

  test("excludes WeCom and WeChat from Electron detection", () => {
    expect(isElectronUserAgent("Mozilla/5.0 Electron/40.0.0 wxwork")).toBe(false)
    expect(isElectronUserAgent("Mozilla/5.0 Electron/40.0.0 MicroMessenger")).toBe(false)
  })
})
