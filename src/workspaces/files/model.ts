import type { FileSystemEntry } from "@opencode/client/promise"
import { createEffect, onCleanup } from "solid-js"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { resolveOpenInAppPath } from "@/session/files/open-in-app-path"
import { createFileTreeStore } from "./tree-store"

export function fileNodes(directory: string, entries: readonly FileSystemEntry[]) {
  return entries
    .map((entry) => {
      const path = entry.path.replaceAll("\\", "/").replace(/\/+$/, "")
      return {
        ...entry,
        path,
        name: path.split("/").at(-1) ?? path,
        absolute: resolveOpenInAppPath(directory, path),
        ignored: false,
      }
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1))
}

// One active workspace; session changes replace the scope and invalidate pending requests.
export function createFileModel(input: {
  directory: () => string
  client: () => OpencodeClient | undefined
  onError: (message: string) => void
}) {
  const tree = createFileTreeStore({
    scope: input.directory,
    normalizeDir: (path) => path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""),
    list: async (path) => {
      const client = input.client()
      const directory = input.directory()
      if (!client || !directory) return []
      const result = await client.file.list({ path, location: { directory } })
      return fileNodes(directory, result.data)
    },
    onError: input.onError,
  })

  createEffect(() => {
    input.directory()
    input.client()
    tree.reset()
  })
  onCleanup(tree.reset)

  return {
    directory: input.directory,
    tree: {
      list: tree.listDir,
      expand: tree.expandDir,
      collapse: tree.collapseDir,
      state: tree.dirState,
      children: tree.children,
      refresh: () => Promise.all(["", ...expandedDirectories("")].map((path) => tree.listDir(path, { force: true }))),
    },
  }

  function expandedDirectories(path: string): string[] {
    return tree
      .children(path)
      .flatMap((node) =>
        node.type === "directory" && tree.dirState(node.path)?.expanded
          ? [node.path, ...expandedDirectories(node.path)]
          : [],
      )
  }
}

export type FileModel = ReturnType<typeof createFileModel>
