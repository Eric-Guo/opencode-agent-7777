import { describe, expect, test } from "bun:test"
import { fileContentFromBytes } from "./artifact"

describe("fileContentFromBytes", () => {
  test.each([
    { path: "folder/接入指南.DOCX", format: "document" },
    { path: "folder/会议报告.PPTX", format: "presentation" },
    { path: "folder/会议预算.XLSX", format: "spreadsheet" },
  ])("keeps $path ZIP bytes for the matching Office viewer", ({ path, format }) => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 1, 2])
    const content = fileContentFromBytes(path, bytes)

    expect(content.kind).toBe("office")
    if (content.kind !== "office") throw new Error("Expected an Office preview")
    expect(content.format).toBe(format)
    expect(content.bytes).toBe(bytes)
    expect([...bytes]).toEqual([0x50, 0x4b, 0x03, 0x04, 0, 1, 2])
  })

  test.each(["docx", "pptx", "xlsx"])("rejects encrypted, mislabeled and oversized %s files", (extension) => {
    expect(
      fileContentFromBytes(`encrypted.${extension}`, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
    ).toEqual({ kind: "binary", problem: "compound" })
    expect(fileContentFromBytes(`invalid.${extension}`, new TextEncoder().encode("plain text"))).toEqual({
      kind: "binary",
      problem: "format",
    })
    expect(fileContentFromBytes(`empty.${extension}`, new Uint8Array())).toEqual({ kind: "binary", problem: "format" })
    const bytes = new Uint8Array(25 * 1024 * 1024 + 1)
    bytes.set([0x50, 0x4b, 0x03, 0x04])
    expect(fileContentFromBytes(`large.${extension}`, bytes)).toEqual({ kind: "binary" })
  })

  test("retains text, unknown-binary and recording previews", () => {
    expect(fileContentFromBytes("notes.txt", new TextEncoder().encode("会议记录"))).toEqual({
      kind: "text",
      text: "会议记录",
    })
    expect(fileContentFromBytes("unknown.bin", new Uint8Array([1, 0, 2]))).toEqual({ kind: "binary" })
    const bytes = new Uint8Array(25 * 1024 * 1024 + 1)
    const content = fileContentFromBytes("recording.mp3", bytes)
    expect(content.kind).toBe("media")
    if (content.kind !== "media") throw new Error("Expected an audio preview")
    expect(content.mime).toBe("audio/mpeg")
    expect(content.bytes).toBe(bytes)
    expect(fileContentFromBytes("large.pdf", bytes)).toEqual({ kind: "binary" })
  })
})
