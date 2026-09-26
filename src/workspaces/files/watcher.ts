import type { OpenCodeEvent } from "@opencode/client/promise"
import type { FileNode } from "@/runtime/server/types"
import { normalizeWorkspacePath } from "./path"

type WatcherEvent = Extract<OpenCodeEvent, { type: "filesystem.changed" }>

type WatcherOps = {
  directory: string
  onChange: (path: string) => void
  node: (path: string) => FileNode | undefined
  isDirLoaded: (path: string) => boolean
  refreshDir: (path: string) => void
}

export function invalidateFromWatcher(event: WatcherEvent, ops: WatcherOps) {
  if (!ops.directory) return
  if (event.location?.directory && normalizeWorkspacePath(ops.directory, event.location.directory) !== "") return
  const path = normalizeWorkspacePath(ops.directory, event.data.file)
  if (path === undefined || path === ".git" || path.startsWith(".git/")) return

  ops.onChange(path)
  if (event.data.event === "change") {
    if (path && ops.node(path)?.type !== "directory") return
    if (ops.isDirLoaded(path)) ops.refreshDir(path)
    return
  }
  const parent = path.split("/").slice(0, -1).join("/")
  if (ops.isDirLoaded(parent)) ops.refreshDir(parent)
}
