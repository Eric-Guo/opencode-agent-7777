import { expect, test } from "bun:test"
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
