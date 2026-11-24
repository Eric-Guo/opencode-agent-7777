import { base64Decode } from "@opencode/util/encode"

export function inlineBase64(url: string) {
  if (url === "data:" || url === "data:,") return ""
  // A comma in a quoted MIME parameter is part of the header.
  const header = /^data:(?:[^",]|"(?:[^"\\]|\\.)*")*?;base64,/i.exec(url)
  return header ? url.slice(header[0].length) : undefined
}

export function decode64(value: string | undefined) {
  if (value === undefined) return
  try {
    return base64Decode(value)
  } catch {
    return
  }
}
