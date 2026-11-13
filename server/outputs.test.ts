import { expect, test } from "bun:test"
import { join } from "node:path"
import type { Conversation } from "@cybros/agent"
import { fileBytes } from "./outputs"
import type { Backend } from "./nexus"

test("runner downloads follow the recorded conversation binding and never fall back to the bridge machine", async () => {
  const root = "/project"
  const chat = { public_id: "chat", default_runner: { executor_public_id: "runner" } } as Conversation
  const actions: string[] = []
  const b = {
    localRunner: "runner",
    native: {
      status: async () => ({ directory: root }),
      operator: async (input: { runner: string; operation: { tool: string; path: string } }) => {
        actions.push(input.runner + "/" + input.operation.tool)
        expect(input.operation.path).toBe(join(root, "notes.md"))
        return { upload: "from-runner" }
      },
    },
    client: {
      uploads: { bytes: async (id: string) => new Response(id) },
      executors: { fetch: async () => ({ services: { runner: { environment: { root } } } }) },
    },
    workspace: {
      conversation: () => ({
        turns: {
          fetch: async () => ({
            public_id: "turn",
            role: "assistant",
            status: "completed",
            active_variant: {
              public_id: "v",
              content: "./notes.md ./outside.md ./control.json",
            },
          }),
        },
      }),
    },
  } as unknown as Backend
  const read = (name: string) =>
    fileBytes(b, chat, new URLSearchParams({ turn: "turn", variant: "v", file: "path:./" + name }))
  expect(await new Response((await read("notes.md")).body).text()).toBe("from-runner")
  await expect(read("unmentioned.md")).rejects.toMatchObject({ status: 404 })
  b.localRunner = "other-runner"
  expect(await new Response((await read("notes.md")).body).text()).toBe("from-runner")
  expect(actions).toEqual(["runner/files_bytes", "runner/files_bytes"])
})
