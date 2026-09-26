import { describe, expect, mock, test } from "bun:test"
import type { OpenCodeEvent } from "@opencode/client/promise"
import { createRoot } from "solid-js"
import { createFileTreeStore } from "./tree-store"
import { normalizeWorkspacePath } from "./path"
import { invalidateFromWatcher } from "./watcher"
import { fileNodes } from "./model"

type WatcherEvent = Extract<OpenCodeEvent, { type: "filesystem.changed" }>
const event = (file: string, change: WatcherEvent["data"]["event"], directory?: string): WatcherEvent => ({
  id: "event-1",
  created: 1,
  type: "filesystem.changed",
  data: { file, event: change },
  ...(directory ? { location: { directory } } : {}),
})

describe("workspace watcher paths", () => {
  test.each([
    ["/workspace", "/workspace/docs/报价#1?100%.txt", "docs/报价#1?100%.txt"],
    ["/workspace/", "./docs/file.txt", "docs/file.txt"],
    ["/workspace", "/workspace-other/file.txt", undefined],
    ["/workspace", "../other/file.txt", undefined],
    ["/workspace", "/workspace", ""],
    ["/", "/file.txt", "file.txt"],
    ["C:\\workspace", "c:\\WORKSPACE\\docs\\file.txt", "docs/file.txt"],
    ["C:\\workspace", "D:\\workspace\\file.txt", undefined],
    ["\\\\server\\share", "\\\\SERVER\\SHARE\\docs\\file.txt", "docs/file.txt"],
  ])("normalizes %s / %s", (directory, path, expected) => {
    expect(normalizeWorkspacePath(directory!, path!)).toBe(expected)
  })
})

describe("file watcher invalidation", () => {
  test.each(["", "nested"])("updates added and deleted Unicode files under '%s'", async (parent) => {
    await createRoot(async (dispose) => {
      const file = parent ? `${parent}/报价#1.txt` : "报价#1.txt"
      let files: string[] = []
      const tree = createFileTreeStore({
        scope: () => "/workspace",
        normalizeDir: (path) => path,
        list: async () =>
          fileNodes(
            "/workspace",
            files.map((path) => ({ path, type: "file" })),
          ),
        onError: (message) => {
          throw new Error(message)
        },
      })
      await tree.listDir(parent)
      const pending: Promise<void>[] = []
      const changed = mock(() => {})
      const ops = {
        directory: "/workspace",
        node: tree.node,
        isDirLoaded: tree.isLoaded,
        onChange: changed,
        refreshDir: (path: string) => {
          pending.push(tree.listDir(path, { force: true }))
        },
      }
      files = [file]
      invalidateFromWatcher(event(`/workspace/${file}`, "add"), ops)
      await Promise.all(pending)
      expect(tree.children(parent).map((node) => node.path)).toEqual([file])
      files = []
      invalidateFromWatcher(event(`/workspace/${file}`, "unlink"), ops)
      await Promise.all(pending)
      expect(tree.children(parent)).toEqual([])
      expect(tree.node(file)).toBeUndefined()
      expect(changed).toHaveBeenCalledWith(file)
      dispose()
    })
  })

  test("notifies previews/search while refreshing only affected loaded directories", () => {
    const onChange = mock((path: string) => {})
    const refreshDir = mock((path: string) => {})
    const ops = {
      directory: "/workspace",
      onChange,
      refreshDir,
      isDirLoaded: (path: string) => path === "" || path === "docs",
      node: (path: string) => fileNodes("/workspace", [{ path, type: path === "docs" ? "directory" : "file" }])[0],
    }
    invalidateFromWatcher(event("/workspace/docs/readme.txt", "change"), ops)
    invalidateFromWatcher(event("/workspace/unopened/new.txt", "add"), ops)
    expect(onChange.mock.calls).toEqual([["docs/readme.txt"], ["unopened/new.txt"]])
    expect(refreshDir).not.toHaveBeenCalled()
    invalidateFromWatcher(event("/workspace/docs", "change"), ops)
    invalidateFromWatcher(event("/workspace", "change"), ops)
    invalidateFromWatcher(event("/workspace/docs/new.txt", "add"), ops)
    expect(refreshDir.mock.calls).toEqual([["docs"], [""], ["docs"]])
  })

  test("ignores unrelated workspaces and Git metadata", () => {
    const onChange = mock((path: string) => {})
    const refreshDir = mock((path: string) => {})
    const ops = { directory: "/workspace", onChange, refreshDir, node: () => undefined, isDirLoaded: () => true }
    for (const update of [
      event("/other/file.txt", "add"),
      event("file.txt", "add", "/other"),
      event("/workspace/file.txt", "add", "/other"),
      event("/workspace/.git/index", "change"),
      event(".git", "add"),
    ])
      invalidateFromWatcher(update, ops)
    expect(onChange).not.toHaveBeenCalled()
    expect(refreshDir).not.toHaveBeenCalled()
  })
})
