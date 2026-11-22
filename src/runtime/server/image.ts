import type { OpenCodeClient } from "@opencode/client/promise"
import { artifactMime } from "@opencode/util/artifact"
import { comparablePath, containsDirectory } from "@opencode/util/path"
import { resolveFilePath } from "@/workspaces/files/path"

export async function readLocalImage(
  api: Pick<OpenCodeClient, "file">,
  directory: string,
  path: string,
  signal: AbortSignal,
) {
  const type = artifactMime(path)
  if (!type?.startsWith("image/") || !directory || /^[\\/]{2}/.test(path)) return
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return

  // Keep the file API scoped to the active workspace, including for absolute paths printed by tools.
  const root = comparablePath(resolveFilePath(directory, "."))
  const target = resolveFilePath(directory, path)
  if (!containsDirectory(root, target)) return
  const relative = target.slice(root.length).replace(/^\/+/, "")
  if (!relative) return
  const bytes = await api.file.read({ location: { directory }, path: relative }, { signal })
  return new Blob([new Uint8Array(bytes)], { type })
}
