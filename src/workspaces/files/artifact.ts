import { artifactKind } from "@opencode/util/artifact"

export type OfficeKind = "document" | "presentation" | "spreadsheet"

export type FilePreviewContent =
  | { kind: "office"; format: OfficeKind; bytes: Uint8Array }
  | { kind: "media"; bytes: Uint8Array; mime: string }
  | { kind: "text"; text: string }
  | { kind: "binary"; problem?: "compound" | "format" }

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024

/** Select the preview before decoding: Office documents are ZIP bytes, never text. */
export function fileContentFromBytes(path: string, bytes: Uint8Array): FilePreviewContent {
  const format = artifactKind(path)
  if (format === "document" || format === "presentation" || format === "spreadsheet") {
    if (bytes.length > MAX_MEDIA_BYTES) return { kind: "binary" }

    if ([0x50, 0x4b, 0x03, 0x04].every((byte, index) => bytes[index] === byte)) {
      return { kind: "office", format, bytes }
    }

    const compound = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte)
    return { kind: "binary", problem: compound ? "compound" : "format" }
  }

  const extension = path.split(".").at(-1)?.toLowerCase() ?? ""
  const mime = new Map([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["gif", "image/gif"],
    ["webp", "image/webp"],
    ["svg", "image/svg+xml"],
    ["pdf", "application/pdf"],
    ["mp3", "audio/mpeg"],
  ]).get(extension)

  // Meeting recordings can exceed the image/PDF/document preview size limit.
  if (mime && (mime === "audio/mpeg" || bytes.length <= MAX_MEDIA_BYTES)) return { kind: "media", bytes, mime }

  if (bytes.length > 1024 * 1024 || bytes.subarray(0, 8192).includes(0)) return { kind: "binary" }

  return { kind: "text", text: new TextDecoder().decode(bytes) }
}
