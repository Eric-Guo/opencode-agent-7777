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
