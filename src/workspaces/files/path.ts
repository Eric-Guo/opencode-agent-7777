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
