import { encodeFilePath } from "@opencode/util/path"

export function fileUrl(directory: string, path: string) {
  const absolute = path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:([\\/]|$)/.test(path)
  return `file://${encodeFilePath(absolute ? path : `${directory.replace(/[\\/]+$/, "")}/${path}`)}`
}
