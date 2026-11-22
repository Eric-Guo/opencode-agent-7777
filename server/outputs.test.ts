import { expect, test } from "bun:test"
import type { Conversation, Turn } from "@cybros/agent"
import { fileBytes, review } from "./outputs"
import type { Backend } from "./nexus"

test("runner downloads follow the recorded conversation binding and never fall back to the bridge machine", async () => {
  const chat = { public_id: "chat", default_runner: { executor_public_id: "runner" } } as Conversation
  const actions: string[] = []
  const b = {
    localRunner: "runner",
    native: {
      status: async () => {
        throw new Error("Downloads must use the conversation binding, not the global directory.")
      },
      operator: async (input: { runner: string; operation: { tool: string; path: string } }) => {
        actions.push([input.runner, input.operation.tool, input.operation.path].join(":"))
        return { upload: "from-runner" }
      },
    },
    client: {
      uploads: { bytes: async (id: string) => new Response(id) },
      executors: {
        fetch: async () => {
          throw new Error("The runtime owns runner path resolution.")
        },
      },
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
              content:
                "./notes.md ./outside.md ./control.json\n\n" +
                "![Plot](figures/plot%20%231.png) ![Remote](https://example.test/chart.png) " +
                "\n\n\x60\x60\x60md\n![Example](fake.png)\n\x60\x60\x60",
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
  const image = (path: string, variant = "v") =>
    fileBytes(b, chat, new URLSearchParams({ turn: "turn", variant, image: path }))
  const plot = await image("figures/plot #1.png")
  expect(plot.name).toBe("plot #1.png")
  expect(await new Response(plot.body).text()).toBe("from-runner")
  await expect(image("figures/plot #1.png", "stale")).rejects.toMatchObject({ status: 409 })
  await expect(image("https://example.test/chart.png")).rejects.toMatchObject({ status: 404 })
  await expect(image("fake.png")).rejects.toMatchObject({ status: 404 })
  b.localRunner = "other-runner"
  expect(await new Response((await read("notes.md")).body).text()).toBe("from-runner")
  expect(actions).toEqual([
    "runner:files_bytes:./notes.md",
    "runner:files_bytes:figures/plot #1.png",
    "runner:files_bytes:./notes.md",
  ])
})

const addedFile = {
  path: "hello world.py",
  state: "text",
  status: "A",
  additions: 1,
  deletions: 0,
  patch: '@@ -0,0 +1 @@\n+print("Hello, World!")',
}

function recording(second: number, files: object[]) {
  return {
    "rho.changes": {
      root: "/project",
      base: "baseline",
      captured_at: new Date(second * 1000).toISOString(),
      truncated: false,
      files,
    },
  }
}

function recordedReview(
  tasks: {
    key: string
    tool?: string
    metadata?: object
    structured?: object
    target?: { executor_public_id: string; kind?: string }
  }[],
) {
  const chat = { public_id: "chat" } as Conversation
  const turn = { active_variant: { run_public_id: "run" } } as Turn
  const backend = {
    workspaceID: "workspace",
    localRunner: "local",
    workspace: {
      run: () => ({
        fetch: async () => ({
          turn: { conversation_public_id: "chat" },
          workspace_public_id: "workspace",
          tasks: tasks.map((task) => ({
            key: task.key,
            status: "completed",
            tool_name: task.tool ?? "terminal",
            target: task.target ?? { executor_public_id: "local" },
          })),
        }),
        task: (key: string) => ({
          fetch: async () => {
            const task = tasks.find((item) => item.key === key)!
            if (task.target) throw new Error("Unexpected read outside the local runner")
            return { metadata: task.metadata, structured_content: task.structured }
          },
        }),
      }),
    },
  } as unknown as Backend
  return review(backend, chat, turn)
}

test("terminal write, read and close expose one saved patch from the latest checkpoint", async () => {
  const files = [addedFile]
  const reviews = await recordedReview([
    { key: "open", metadata: recording(1, []) },
    { key: "write", metadata: recording(2, files) },
    { key: "close", metadata: recording(4, files) },
    { key: "read", metadata: recording(3, [{ ...addedFile, patch: "older patch" }]) },
    { key: "remote", target: { executor_public_id: "other" } },
    { key: "mcp", target: { executor_public_id: "local", kind: "mcp" } },
  ])
  expect(reviews).toEqual([
    {
      source: "checkpoint",
      root: "/project",
      base: "baseline",
      runner: "local",
      run: "run",
      truncated: false,
      files: [{ ...addedFile, status: "added" }],
    },
  ])
  expect(
    await recordedReview([
      { key: "write", metadata: recording(1, files) },
      { key: "undo", metadata: recording(2, []) },
    ]),
  ).toEqual([])
})

test("checkpoint changes supplement step patches and preserve their restore targets", async () => {
  const binary = { path: "logo.png", state: "binary", status: "M" }
  const { path, patch, additions, deletions } = addedFile
  const reviews = await recordedReview([
    {
      key: "step-write",
      tool: "write",
      structured: { root: "/project", change: { file: path, status: "added", patch, additions, deletions } },
      metadata: { checkpoint: { hash: "before", store: "project" } },
    },
    { key: "terminal", metadata: recording(2, [addedFile, binary]) },
  ])
  expect(reviews).toMatchObject([
    { base: "step-write", restorable: true, files: [{ path, patch, status: "added" }] },
    { base: "baseline", source: "checkpoint", files: [{ ...binary, status: "modified" }] },
  ])
})
