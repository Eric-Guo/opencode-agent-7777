import { expect, test } from "bun:test"
import { Client, type Conversation, type Turn } from "@cybros/agent"
import { fileBytes, outputs, restoreReview, review } from "./outputs"
import type { Backend } from "./nexus"
import { projectTurn } from "../src/nexus/chat"

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

function recording(second: number | string, files: object[]) {
  return {
    "rho.changes": {
      root: "/project",
      base: "baseline",
      captured_at: typeof second === "string" ? second : new Date(second * 1000).toISOString(),
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
    completed?: string
    structured?: object
    target?: { executor_public_id: string; kind?: string }
  }[],
  runners = ["local"],
  cutoff?: string,
  localRunner: string | null = "local",
) {
  const chat = { public_id: "chat" } as Conversation
  const turn = {
    status: "completed",
    active_variant: {
      run_public_id: "run",
      runner_effects: {
        status: "touched",
        runners: runners.map((runner_executor_public_id) => ({ runner_executor_public_id })),
      },
    },
  } as Turn
  const backend = {
    workspaceID: "workspace",
    localRunner,
    workspace: {
      run: () => ({
        fetch: async () => ({
          turn: { conversation_public_id: "chat" },
          public_id: "run",
          deliverable_task_key: "answer",
          completed_at: cutoff,
          workspace_public_id: "workspace",
          tasks: tasks.map((task) => ({
            key: task.key,
            completed_at: task.completed,
            status: "completed",
            tool_name: task.tool ?? "terminal",
            target: task.target ?? { executor_public_id: "local" },
          })),
        }),
        task: (key: string) => ({
          fetch: async () => {
            const task = tasks.find((item) => item.key === key)!
            if (!task.metadata && !task.structured) throw new Error("Unexpected task read: " + key)
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
      restoreTasks: [],
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
    {
      base: "baseline",
      source: "checkpoint",
      restoreTasks: ["step-write"],
      files: [
        { path, patch, status: "added" },
        { ...binary, status: "modified" },
      ],
    },
  ])
})

test("a checkpoint from a bash task with no diff restores a later change to the same root", async () => {
  const baseline = { ...recording(1, []), checkpoint: { hash: "before", store: "project" } }
  const tasks = [
    { key: "pwd", tool: "bash", metadata: baseline, structured: { exit_status: 0 } },
    { key: "write", tool: "write", metadata: recording(2, [addedFile]) },
  ]
  expect(await recordedReview(tasks)).toMatchObject([
    { root: "/project", restoreTasks: ["pwd"], files: [{ path: addedFile.path }] },
  ])
  expect(await recordedReview(tasks, ["local"], undefined, null)).toMatchObject([{ restoreTasks: [] }])
  expect(await recordedReview(tasks.slice(0, 1))).toEqual([])
})

test("review uses the original runners, the reply cutoff and the full precision of each capture", async () => {
  const when = (fraction: string) => "2026-11-23T00:00:00." + fraction + "Z"
  const original = { executor_public_id: "original", kind: "runner" }
  const other = { executor_public_id: "other", kind: "runner" }
  const snapshot = (fraction: string, path: string) => recording(when(fraction), [{ ...addedFile, path }])
  const reviews = await recordedReview(
    [
      { key: "new", target: original, metadata: snapshot("123456", "new.txt") },
      { key: "other", target: other, metadata: snapshot("123457", "other.txt") },
      { key: "old", target: original, metadata: snapshot("1231", "old.txt") },
      { key: "late", target: original, completed: when("500001") },
      { key: "answer", target: { executor_public_id: "agent" }, completed: when("500000") },
    ],
    ["original", "other"],
    when("600000"),
    null,
  )
  expect(reviews.map((r) => [r.runner, r.files[0].path, r.restoreTasks])).toEqual([
    ["original", "new.txt", []],
    ["other", "other.txt", []],
  ])
  expect(await recordedReview([{ key: "late", completed: when("500001") }], ["local"], when("500000"))).toEqual([])
})

test("an empty cumulative review supersedes per-task patches while older standalone patches retain their restore target", async () => {
  const step = {
    key: "edit",
    tool: "edit",
    structured: {
      root: "/project",
      change: {
        file: "file",
        patch: "change",
        additions: 1,
        deletions: 0,
        status: "added",
      },
    },
    metadata: { checkpoint: { hash: "before", store: "project" } },
  }
  expect(await recordedReview([step])).toMatchObject([{ base: "edit", restoreTasks: ["edit"] }])
  expect(await recordedReview([step, { key: "undo", metadata: recording(2, []) }])).toEqual([])
})

test("inherited answers read their original turn’s run and keep checkpoint restoration in its owning conversation", async () => {
  const chat = { public_id: "fork" } as Conversation
  const turn = {
    public_id: "inherited",
    inherited: true,
    role: "assistant",
    status: "completed",
    callback_sources: [],
    active_variant: {
      run_public_id: "original",
      status: "completed",
      runner_effects: { status: "touched", runners: [{ runner_executor_public_id: "local" }] },
    },
  } as unknown as Turn
  const workspace = {
    run: () => ({
      fetch: async () => ({
        public_id: "original",
        workspace_public_id: "workspace",
        turn: { conversation_public_id: "parent", public_id: "inherited" },
        tasks: [{ key: "write", status: "completed", tool_name: "write", target: { executor_public_id: "local" } }],
      }),
      task: () => ({
        fetch: async () => ({
          metadata: { ...recording(1, [addedFile]), checkpoint: { hash: "retained", store: "project" } },
          structured_content: { root: "/project", change: { ...addedFile, file: addedFile.path, status: "added" } },
        }),
      }),
    }),
  }
  const backend = {
    client: { workspace: () => workspace },
    workspace,
    workspaceID: "workspace",
    localRunner: "local",
  } as unknown as Backend
  expect(await review(backend, chat, turn)).toMatchObject([
    { runner: "local", restoreTasks: [], files: [{ path: addedFile.path }] },
  ])
  expect(await outputs(backend, chat, turn)).toEqual([])
  await expect(restoreReview(backend, chat, turn, "write", "receipt")).rejects.toMatchObject({ status: 409 })
  await expect(review(backend, chat, { ...turn, public_id: "unrelated" })).rejects.toMatchObject({ status: 404 })
})

test("answer downloads follow the accepted child variant and its generated image under the viewing Human", async () => {
  const calls: string[] = []
  const task = {
    status: "completed",
    kind: "tool_task",
    lifetime: "turn",
    wake: "immediate",
    after: [],
    waiting_on: [],
  }
  const variant = { public_id: "accepted", source: "run", status: "completed", run_public_id: "child-run" }
  const turn = {
    role: "assistant",
    kind: "direct_reply",
    status: "completed",
    public_id: "turn",
    position: 1,
    visibility: "visible",
    created_at: "2026-11-23T00:00:00Z",
    answering_user_public_id: "agent",
  }
  const child = {
    conversation_public_id: "worker",
    turn_public_id: "child",
    variant_public_id: "accepted",
    status: "completed",
    input_public_id: "input",
    run_public_id: "child-run",
    requester_speaker_public_id: "human",
  }
  const source = {
    input_public_id: "callback",
    origin: "child",
    sender_conversation_public_id: "worker",
    sender_run_public_id: "child-run",
    sender_task_key: "spawn",
  }
  const image = new Uint8Array([137, 80, 78, 71, 0])
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname
      calls.push(path)
      expect(req.headers.get("authorization")).toBe("Bearer viewing-human")
      if (path.endsWith("/conversations/parent/turns/turn"))
        return Response.json({
          turn: {
            ...turn,
            active_variant: { ...variant, public_id: "answer", run_public_id: null },
            callback_sources: [
              { ...source, result: child },
              { ...source, result: { ...child, conversation_public_id: "private" } },
            ],
          },
        })
      if (path.endsWith("/private/turns/child"))
        return Response.json({ error: { code: "forbidden", message: "Private child" } }, { status: 403 })
      if (path.endsWith("/worker/turns/child"))
        return Response.json({
          turn: {
            ...turn,
            public_id: "child",
            active_variant: { ...variant, public_id: "replacement", run_public_id: "later" },
          },
        })
      if (path.endsWith("/worker/turns/child/variants/accepted"))
        return Response.json({ turn: { public_id: "child", inherited: false }, variant })
      if (path.endsWith("/runs/child-run"))
        return Response.json({
          run: {
            public_id: "child-run",
            status: "completed",
            tasks: [
              { ...task, key: "paint", tool_name: "image_generate" },
              { ...task, key: "generated", kind: "model_task", workload: "image_generation" },
              {
                ...task,
                key: "screenshot",
                tool_name: "browser_screenshot",
                target: { kind: "runner", executor_public_id: "local" },
              },
            ],
          },
        })
      if (path.endsWith("/runs/child-run/graph"))
        return Response.json({
          nodes: [
            {
              key: "generated",
              kind: "model_task",
              status: "completed",
              visibility: "public",
              lifetime: "turn",
              wake: "immediate",
              deliverable: false,
              input_from: [],
              result_from: [],
              expansion_parent: "paint",
            },
          ],
          edges: [],
          mermaid: "graph TD",
        })
      if (path.endsWith("/tasks/generated"))
        return Response.json({
          task: {
            ...task,
            key: "generated",
            content: [
              {
                type: "resource_link",
                uri: "nexus://uploads/image",
                mimeType: "image/png",
                size: image.length,
                name: "generated.png",
              },
            ],
          },
        })
      if (path.endsWith("/uploads/image/bytes")) return new Response(image)
      throw new Error("Unexpected request " + path)
    },
  })
  try {
    const client = new Client({ baseURL: server.url.origin, credential: "viewing-human" })
    const workspace = client.workspace("workspace")
    const backend = { client, workspace, workspaceID: "workspace", localRunner: "local" } as Backend
    const chat = { public_id: "parent" } as Conversation
    const parent = await workspace.conversation("parent").turns.fetch("turn")
    expect(await outputs(backend, chat, parent)).toEqual([{ id: "image", name: "generated.png" }])
    const receipt = { ...parent, role: "user", kind: "message", origin: "child" }
    expect(projectTurn(receipt).files).toBe(true)
    expect(await outputs(backend, chat, receipt)).toEqual([{ id: "image", name: "generated.png" }])
    const query = new URLSearchParams({ turn: "turn", variant: "answer", file: "image" })
    const file = await fileBytes(backend, chat, query)
    expect(new Uint8Array(await new Response(file.body).arrayBuffer())).toEqual(image)
    query.set("variant", "obsolete")
    await expect(fileBytes(backend, chat, query)).rejects.toMatchObject({ status: 409 })
    expect(calls.some((path) => /tasks\/screenshot|runs\/later/.test(path))).toBe(false)
  } finally {
    server.stop(true)
  }
})
