import { expect, test } from "bun:test"
import { getEventListeners } from "node:events"
import type { OpencodeClient } from "@/runtime/server/client-compact"
import { createFileSearch } from "./model"

function fixture() {
  const calls: {
    input: unknown
    signal?: AbortSignal
    result: ReturnType<typeof Promise.withResolvers<{ data: { path: string; type: "file" | "directory" }[] }>>
  }[] = []
  const client = {
    file: {
      find(input: unknown, options?: { signal?: AbortSignal }) {
        const result = Promise.withResolvers<{ data: { path: string; type: "file" | "directory" }[] }>()
        calls.push({ input, signal: options?.signal, result })
        return result.promise
      },
    },
  } as unknown as Pick<OpencodeClient, "file">
  return { client, calls }
}

test("searches files and directories in the active scope, deduplicates paths, and skips empty queries", async () => {
  const { client, calls } = fixture()
  const files = createFileSearch(() => ({ client, directory: "/workspace" }))
  expect(await files.searchFilesAndDirectories("  ")).toEqual([])
  expect(calls).toHaveLength(0)
  const result = files.searchFilesAndDirectories("src")
  expect(calls[0].input).toEqual({ location: { directory: "/workspace" }, query: "src", limit: 50 })
  expect(files.state.status).toBe("loading")
  calls[0].result.resolve({
    data: [
      { path: "src/", type: "directory" },
      { path: "src/index.ts", type: "file" },
      { path: "src/index.ts", type: "file" },
    ],
  })
  expect(await result).toEqual(["src/", "src/index.ts"])
  expect(files.state.status).toBe("ready")
})

test("aborts older queries and ignores late responses after changing directories or clearing", async () => {
  const { client, calls } = fixture()
  let directory = "/old"
  const files = createFileSearch(() => ({ client, directory }))
  const old = files.searchFilesAndDirectories("read")
  directory = "/new"
  const next = files.searchFilesAndDirectories("README")
  expect(calls[0].signal?.aborted).toBe(true)
  expect(calls[1].input).toEqual({ location: { directory: "/new" }, query: "README", limit: 50 })
  calls[1].result.resolve({ data: [{ path: "README.md", type: "file" }] })
  expect(await next).toEqual(["README.md"])
  calls[0].result.reject(new Error("Old failure"))
  expect(await old).toEqual([])
  expect(files.state.status).toBe("ready")

  const disposed = files.searchFilesAndDirectories("src")
  files.clear()
  expect(calls[2].signal?.aborted).toBe(true)
  calls[2].result.resolve({ data: [{ path: "ignored.ts", type: "file" }] })
  expect(await disposed).toEqual([])
  expect(files.state.status).toBe("ready")
})

test("recovers after a failed search without rejecting the skill suggestion list", async () => {
  const { client, calls } = fixture()
  const files = createFileSearch(() => ({ client, directory: "/workspace" }))
  const failed = files.searchFilesAndDirectories("missing")
  calls[0].result.reject(new Error("Offline"))
  expect(await failed).toEqual([])
  expect(files.state.status).toBe("failed")
  const recovered = files.searchFilesAndDirectories("next")
  calls[1].result.resolve({ data: [] })
  expect(await recovered).toEqual([])
  expect(files.state.status).toBe("ready")
  expect(await createFileSearch(() => undefined).searchFilesAndDirectories("src")).toEqual([])
})

test("caller cancellation settles an abort-ignoring read and leaves the next search owned", async () => {
  const { client, calls } = fixture()
  const files = createFileSearch(() => ({ client, directory: "/workspace" }))
  const owner = new AbortController()
  const pending = files.searchFilesAndDirectories("old", owner.signal)
  owner.abort()
  expect(calls[0].signal?.aborted).toBe(true)
  expect(await pending).toEqual([])
  expect(files.state.status).toBe("ready")
  expect(getEventListeners(owner.signal, "abort")).toHaveLength(0)

  const nextOwner = new AbortController()
  const next = files.searchFilesAndDirectories("new", nextOwner.signal)
  calls[0].result.resolve({ data: [{ path: "late.ts", type: "file" }] })
  await Promise.resolve()
  expect(files.state.status).toBe("loading")
  expect(calls[1].signal?.aborted).toBe(false)
  nextOwner.abort()
  expect(await next).toEqual([])
  expect(calls[1].signal?.aborted).toBe(true)
})

test("already cancelled callers start no request and settled reads release their listener", async () => {
  const { client, calls } = fixture()
  const files = createFileSearch(() => ({ client, directory: "/workspace" }))
  const owner = new AbortController()
  owner.abort()
  expect(await files.searchFilesAndDirectories("src", owner.signal)).toEqual([])
  expect(calls).toHaveLength(0)

  const settled = new AbortController()
  const result = files.searchFilesAndDirectories("src", settled.signal)
  expect(getEventListeners(settled.signal, "abort")).toHaveLength(1)
  calls[0].result.resolve({ data: [] })
  expect(await result).toEqual([])
  expect(getEventListeners(settled.signal, "abort")).toHaveLength(0)
  settled.abort()
  expect(calls[0].signal?.aborted).toBe(false)
  expect(files.state.status).toBe("ready")
})

test.each(["success", "failure"])("keeps a newer search pending after a superseded %s", async (outcome) => {
  const { client, calls } = fixture()
  const files = createFileSearch(() => ({ client, directory: "/workspace" }))
  const first = files.searchFilesAndDirectories("src")
  const second = files.searchFilesAndDirectories("src")
  expect(calls[0].signal?.aborted).toBe(true)

  if (outcome === "success") calls[0].result.resolve({ data: [{ path: "stale.ts", type: "file" }] })
  else calls[0].result.reject(new Error("Stale failure"))
  expect(await first).toEqual([])
  expect(files.state.status).toBe("loading")
  expect(calls[1].signal?.aborted).toBe(false)

  // Settling the older request must not release the newer request's cancellation handle.
  expect(await files.searchFilesAndDirectories(" ")).toEqual([])
  expect(calls).toHaveLength(2)
  expect(calls[1].signal?.aborted).toBe(true)
  expect(files.state.status).toBe("ready")
  const third = files.searchFilesAndDirectories("src")
  calls[1].result.resolve({ data: [{ path: "cancelled.ts", type: "file" }] })
  expect(await second).toEqual([])
  expect(files.state.status).toBe("loading")
  calls[2].result.resolve({ data: [{ path: "current.ts", type: "file" }] })
  expect(await third).toEqual(["current.ts"])
  expect(files.state.status).toBe("ready")
})
