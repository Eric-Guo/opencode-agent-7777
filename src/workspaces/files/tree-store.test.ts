import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { FileNode } from "@/runtime/server/types"
import { createFileTreeStore } from "./tree-store"
import { fileNodes } from "./model"

const node = (path: string, type: "file" | "directory" = "file"): FileNode => ({
  path,
  type,
  name: path.split("/").at(-1)!,
  absolute: `/workspace/${path}`,
  ignored: false,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { resolve, reject, promise }
}

describe("workspace file tree", () => {
  test("removing a folder clears a racing watcher error without leaving a global banner", async () => {
    await createRoot(async (dispose) => {
      const onError = mock(() => {})
      let removed = false
      const tree = createFileTreeStore({
        scope: () => "/workspace",
        normalizeDir: (path) => path,
        list: async (path) => {
          if (!path) return removed ? [] : [node("docs", "directory")]
          if (removed) throw new Error("UnexpectedStatus: 500")
          return [node("docs/readme.txt")]
        },
        onError,
      })
      await tree.listDir("")
      await tree.listDir("docs")
      removed = true
      // The child's unlink can finish its refresh before the parent's unlink.
      await tree.listDir("docs", { force: true, reportError: false })
      expect(tree.dirState("docs")?.error).toBe("UnexpectedStatus: 500")
      await tree.listDir("", { force: true, reportError: false })
      expect(tree.dirState("docs")).toBeUndefined()
      expect(tree.children("")).toEqual([])
      expect(onError).not.toHaveBeenCalled()
      dispose()
    })
  })

  test("coalesces watcher updates during a read and fetches the latest contents afterwards", async () => {
    await createRoot(async (dispose) => {
      const pending = deferred<FileNode[]>()
      const list = mock(() => pending.promise)
      const tree = createFileTreeStore({ scope: () => "/workspace", normalizeDir: (path) => path, list, onError() {} })
      const first = tree.listDir("")
      const refresh = tree.listDir("", { force: true })
      expect(tree.listDir("", { force: true })).toBe(refresh)
      list.mockImplementation(() => Promise.resolve([node("new.txt")]))
      pending.resolve([node("old.txt")])
      await Promise.all([first, refresh])
      expect(tree.children("").map((file) => file.path)).toEqual(["new.txt"])
      expect(list).toHaveBeenCalledTimes(2)
      dispose()
    })
  })

  test("discards a queued watcher refresh when the workspace resets", async () => {
    await createRoot(async (dispose) => {
      const pending = deferred<FileNode[]>()
      const list = mock(() => pending.promise)
      const tree = createFileTreeStore({ scope: () => "/workspace", normalizeDir: (path) => path, list, onError() {} })
      const first = tree.listDir("")
      const refresh = tree.listDir("", { force: true })
      tree.reset()
      pending.resolve([node("old.txt")])
      await Promise.all([first, refresh])
      expect(tree.children("")).toEqual([])
      expect(list).toHaveBeenCalledTimes(1)
      dispose()
    })
  })

  test("forgets a removed folder's cache and pending reads before it is recreated", async () => {
    await createRoot(async (dispose) => {
      const pending = deferred<FileNode[]>()
      let visible = true
      const tree = createFileTreeStore({
        scope: () => "/workspace",
        normalizeDir: (path) => path,
        onError() {},
        list: (path) => (path ? pending.promise : Promise.resolve(visible ? [node("docs", "directory")] : [])),
      })
      await tree.listDir("")
      tree.expandDir("docs")
      const previous = tree.listDir("docs")
      visible = false
      await tree.listDir("", { force: true })
      pending.resolve([node("docs/deleted.md")])
      await previous
      expect(tree.dirState("docs")).toBeUndefined()
      expect(tree.children("docs")).toEqual([])
      visible = true
      await tree.listDir("", { force: true })
      expect(tree.isLoaded("docs")).toBe(false)
      dispose()
    })
  })

  test("deduplicates folder requests, expands lazily, and retries failures", async () => {
    await createRoot(async (dispose) => {
      const pending = deferred<FileNode[]>()
      const list = mock((path: string) => (path ? Promise.resolve([node("docs/readme.md")]) : pending.promise))
      const tree = createFileTreeStore({ scope: () => "/workspace", normalizeDir: (path) => path, list, onError() {} })
      const first = tree.listDir("")
      expect(tree.listDir("")).toBe(first)
      expect(tree.dirState("")?.loading).toBe(true)
      pending.resolve([node("docs", "directory")])
      await first
      expect(tree.children("").map((item) => item.path)).toEqual(["docs"])
      expect(list).toHaveBeenCalledTimes(1)
      tree.expandDir("docs")
      await tree.listDir("docs")
      expect(tree.children("docs").map((item) => item.path)).toEqual(["docs/readme.md"])
      tree.collapseDir("docs")
      expect(tree.dirState("docs")?.expanded).toBe(false)
      list.mockImplementationOnce(() => Promise.reject(new Error("offline")))
      await tree.listDir("docs", { force: true })
      expect(tree.dirState("docs")?.error).toBe("offline")
      await tree.listDir("docs", { force: true })
      expect(tree.dirState("docs")?.error).toBeUndefined()
      expect(tree.dirState("docs")?.loading).toBe(false)
      dispose()
    })
  })

  test.each([false, true])(
    "ignores a stale request after reset even when the same directory is reactivated (failure=%s)",
    async (fail) => {
      await createRoot(async (dispose) => {
        const old = deferred<FileNode[]>()
        const current = deferred<FileNode[]>()
        const error = mock(() => {})
        const list = mock(() => old.promise)
        const tree = createFileTreeStore({
          scope: () => "/workspace",
          normalizeDir: (path) => path,
          list,
          onError: error,
        })
        const first = tree.listDir("")
        tree.reset()
        list.mockImplementation(() => current.promise)
        const second = tree.listDir("")
        if (fail) old.reject(new Error("old error"))
        else old.resolve([node("old.txt")])
        await first
        expect(tree.children("")).toEqual([])
        expect(tree.dirState("")).toEqual({ expanded: true, loading: true, error: undefined })
        expect(tree.listDir("")).toBe(second)
        expect(error).not.toHaveBeenCalled()
        current.resolve([node("new.txt")])
        await second
        expect(tree.children("").map((item) => item.path)).toEqual(["new.txt"])
        dispose()
      })
    },
  )

  test("maps server entries relative to the active root and sorts folders before files", () => {
    expect(
      fileNodes("C:\\workspace\\agent7777", [
        { path: "z.txt", type: "file" },
        { path: "docs/", type: "directory" },
        { path: "a.txt", type: "file" },
      ]).map(({ path, absolute }) => ({ path, absolute })),
    ).toEqual([
      { path: "docs", absolute: "C:\\workspace\\agent7777\\docs" },
      { path: "a.txt", absolute: "C:\\workspace\\agent7777\\a.txt" },
      { path: "z.txt", absolute: "C:\\workspace\\agent7777\\z.txt" },
    ])
  })
})
