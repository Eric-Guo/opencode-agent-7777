// Package-local subset of the main app's file-path boundary.
export function encodeFilePath(path: string) {
  let normalized = path.replace(/\\/g, "/")
  if (/^[A-Za-z]:/.test(normalized)) normalized = `/${normalized}`
  return normalized
    .split("/")
    .map((segment, index) => (index === 1 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join("/")
}

export function fileUrl(directory: string, path: string) {
  const absolute = path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:([\\/]|$)/.test(path)
  return `file://${encodeFilePath(absolute ? path : `${directory.replace(/[\\/]+$/, "")}/${path}`)}`
}

// Watcher paths are raw filesystem paths, so preserve characters such as #, ? and %.
export function normalizeWorkspacePath(directory: string, input: string): string | undefined {
  const root = directory.replaceAll("\\", "/").replace(/\/+$/, "")
  let path = input.replaceAll("\\", "/").replace(/\/+$/, "")
  const windows = /^[A-Za-z]:/.test(root) || root.startsWith("//")
  const compare = (value: string) => (windows ? value.toLowerCase() : value)
  if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) {
    if (compare(path) === compare(root)) return ""
    if (!compare(path).startsWith(compare(root) + "/")) return
    path = path.slice(root.length + 1)
  }
  path = path.replace(/^\.\//, "")
  if (path.split("/").includes("..")) return
  return path
}
