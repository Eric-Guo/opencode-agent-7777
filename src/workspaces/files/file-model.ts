import type { FileSystemEntry } from "@opencode/client/promise"
import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { OpencodeClient, OpenCodeEventStream } from "@/runtime/server/client-compact"
import { resolveOpenInAppPath } from "@/session/files/open-in-app-path"
import { createFileTreeStore } from "./tree-store"
import { invalidateFromWatcher } from "./watcher"

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
  events: OpenCodeEventStream
  onChange: (path: string) => void
  onError: (message: string) => void
}) {
  const [changes, setChanges] = createStore({ revision: 0 })
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
  onCleanup(
    input.events.listen((event) => {
      if (event.type !== "filesystem.changed") return
      invalidateFromWatcher(event, {
        directory: input.directory(),
        node: tree.node,
        isDirLoaded: (path) => !!tree.dirState(path)?.loading || tree.isLoaded(path),
        // A child unlink may race with deletion of its parent. Keep background
        // errors on the directory so removing it also removes its error state.
        refreshDir: (path) => void tree.listDir(path, { force: true, reportError: false }),
        onChange: (path) => {
          setChanges("revision", (value) => value + 1)
          input.onChange(path)
        },
      })
    }),
  )

  return {
    directory: input.directory,
    revision: () => changes.revision,
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
