import { encodeFilePath } from "@opencode/util/path"

export function fileUrl(directory: string, path: string) {
  const absolute = path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:([\\/]|$)/.test(path)
  return `file://${encodeFilePath(absolute ? path : `${directory.replace(/[\\/]+$/, "")}/${path}`)}`
}

// Markdown supplies decoded paths. Encode before URL normalization so #, ? and % stay in the filename.
export function resolveFilePath(directory: string, path: string) {
  return decodeURIComponent(new URL(fileUrl(directory, path)).pathname).replace(/^\/([a-z]:\/)/i, "$1")
}
