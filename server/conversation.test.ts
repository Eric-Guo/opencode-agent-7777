import { expect, test } from "bun:test"
import { APIError } from "@cybros/agent"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { gzipSync } from "node:zlib"
import { middleware } from "./middleware"
import type { Backend } from "./nexus"

async function bridge(b: Backend) {
  const handle = middleware(
    () => ({
      token: "test",
      native: {
        origin: "https://nexus.example",
        connection: async () => ({ url: "http://127.0.0.1", password: "test" }),
      },
    }),
    async () => b,
  )
  const server = createServer((req, res) => void handle(req, res, () => res.end()))
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port
  const send = (path: string, body?: unknown) =>
    fetch(base + "/api/7777" + path, {
      method: body ? "POST" : "GET",
      headers: { origin: base, "x-7777-scope": "scope", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  return {
    send,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

test("the settings bridge returns every catalog tool in kernel order for the active scope", async () => {
  const connection = { scope: "scope" }
  const rows = [
    { canonical_name: "nexus.future.new", name: "new", definition: { function: { description: "A new tool." } } },
    {
      canonical_name: "nexus.memory.read",
      name: "memory_read",
      definition: { function: { description: "Read memory." } },
    },
  ]
  const backend = { connection, client: { tools: { list: async () => rows } } } as unknown as Backend
  const { send, close } = await bridge(backend)
  try {
    expect(await (await send("/settings/kernel-tools")).json()).toEqual([
      { canonical: "nexus.future.new", name: "new", description: "A new tool." },
      { canonical: "nexus.memory.read", name: "memory_read", description: "Read memory." },
    ])
    connection.scope = "changed"
    expect((await send("/settings/kernel-tools")).status).toBe(409)
  } finally {
    await close()
  }
})

test("new-chat choices resolve the operator runner and expose its identity and presence", async () => {
  let selection: string | null = "remote"
  const backend = {
    connection: { scope: "scope" },
    client: { models: { list: async () => [] } },
    native: {
      manage: async ({ payload }: { payload: { action: string; name?: string; input?: unknown } }) => {
        if (payload.action === "application.defaults")
          return { available: true, code_mode_available: true, code_mode: true, subagent: true }
        expect(payload).toEqual({ action: "extension.call", name: "runners", input: {} })
        return {
          selection,
          runners: [
            { public_id: "local", display_name: null, own: true, presence: "online" },
            { public_id: "remote", display_name: "Build host", own: false, presence: "offline" },
          ],
        }
      },
    },
  } as unknown as Backend
  const { send, close } = await bridge(backend)
  try {
    expect(await (await send("/choices")).json()).toMatchObject({
      defaultRunner: "remote",
      runners: [
        { id: "local", name: "local", own: true, presence: "online" },
        { id: "remote", name: "Build host", own: false, presence: "offline" },
      ],
    })
    selection = null
    expect(await (await send("/choices")).json()).toMatchObject({ defaultRunner: "local" })
  } finally {
    await close()
  }
})

test("exports the retained Nexus records as JSON through the read-only and archived conversation route", async () => {
  const records = [
    { type: "export", format: "nexus.conversation.diagnostic", version: 1 },
    ...Array.from({ length: 12 }, (_, i) => ({ type: "turn", turn: { position: i + 1, text: "你好" } })),
    { type: "task", task: { output: "first\nsecond" } },
    { type: "usage", usage: { exact: "UNSAFE_INTEGER" } },
    { type: "execution_unavailable", reason: "execution_details_pruned" },
    { type: "end" },
  ].map((record) =>
    JSON.stringify({ conversation_public_id: "a", ...record }).replace('"UNSAFE_INTEGER"', "9007199254740993"),
  )
  const packed = (lines: string[]) => gzipSync(lines.join("\n") + "\n")
  let workspace = "w"
  let body = packed(records)
  let exports = 0
  const b = {
    workspaceID: "w",
    connection: { scope: "scope" },
    workspace: {
      conversation: () => ({
        fetch: async () => ({
          public_id: "a",
          workspace_public_id: workspace,
          archived_at: "now",
          access: { default: "read" },
        }),
        export: async () => {
          exports++
          return { status: 200, contentType: "application/gzip", body: new Response(body).body }
        },
      }),
    },
  } as unknown as Backend
  const { send, close } = await bridge(b)
  const path = "/chats/a/export"
  try {
    const res = await send(path)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="conversation-a.json"')
    expect(res.headers.get("cache-control")).toBe("no-store")
    const json = await res.text()
    expect(JSON.parse(json)).toEqual(records.map((record) => JSON.parse(record)))
    expect(json).toContain('"exact":9007199254740993')

    workspace = "other"
    expect((await send(path)).status).toBe(404)
    expect(exports).toBe(1)
    workspace = "w"

    const valid = packed(records)
    for (const [label, broken] of [
      ["invalid gzip", Buffer.from("not gzip")],
      ["truncated trailer", valid.subarray(0, valid.length - 1)],
      ["missing end", packed(records.slice(0, -1))],
      ["wrong conversation", packed([records[0].replace('"a"', '"b"'), ...records.slice(1)])],
    ] as const) {
      body = broken
      const result = await send(path)
        .then(async (response) => ({ status: response.status, text: await response.text() }))
        .catch(() => undefined)
      expect(result?.status === 200 && result.text.endsWith("\n]\n"), label).toBe(false)
    }
  } finally {
    await close()
  }
})

test("scoped bridge enforces channel ownership, archive state, run and file ownership", async () => {
  let bound = true,
    bot = false,
    archived = false,
    full = true,
    deletes = 0,
    approvals = 0,
    executionReads = 0
  const pages: string[] = [],
    promoted: string[] = []
  const info = () => ({
    public_id: "a",
    workspace_public_id: "w",
    answering_user_public_id: "agent",
    default_runner: { executor_public_id: "runner" },
    metadata: { "opencode.surface": bound ? "channel" : "desktop", ...(bot ? { "opencode.bot": "private-bot" } : {}) },
    archived_at: archived ? "now" : null,
    side: false,
    title: "Conversation",
    lock_version: 2,
    access: { entries: [], default: full ? "full" : "read" },
  })
  const chat = {
    fetch: async () => info(),
    memory: () => ({ bindings: async () => ({ bindings: [] }) }),
    archive: async () => {
      archived = true
    },
    unarchive: async () => {
      archived = false
    },
    delete: async () => {
      deletes++
    },
    inputs: {
      list: async () => ({
        items: [{ state: "steering", delivery_mode: "steer", public_id: "new", queue_position: 1, lock_version: 4 }],
      }),
      update: async (id: string) => {
        promoted.push(id)
      },
    },
    turns: {
      fetch: async () => ({
        public_id: "turn",
        active_variant: { public_id: "v2", attachments: [{ public_id: "published", filename: "picture.png" }] },
      }),
    },
  }
  const page = (name: string, query: { after?: string; answering_user_public_id: string }) => {
    pages.push([name, query.after, query.answering_user_public_id].join("/"))
    return { items: [], next_after: null }
  }
  const b = {
    workspaceID: "w",
    workspaceActive: true,
    humanID: "human",
    agentID: "agent",
    connection: { scope: "scope" },
    client: {
      uploads: { bytes: async (id: string) => new Response(id === "published" ? new Uint8Array([0, 255, 17]) : null) },
      work: { attention: async () => ({ items: [], next_after: null }) },
    },
    workspace: {
      conversation: () => chat,
      conversations: { list: (q: any) => page("active", q), archived: (q: any) => page("archived", q) },
      run: (rid: string) => ({
        fetch: async () => ({
          workspace_public_id: null,
          turn: { conversation_public_id: rid === "mine" ? "a" : "other" },
        }),
        transcript: async () => {
          executionReads++
          return { rounds: [] }
        },
        task: (key: string) => ({
          fetch: async () => ({
            task:
              key === "mcp"
                ? {
                    key,
                    kind: "tool_task",
                    status: "completed",
                    tool_name: "write",
                    tool_alias: "research_write",
                    target: {
                      kind: "mcp",
                      connection_public_id: "work",
                      account_label: "Research",
                      tool_name: "write",
                    },
                  }
                : { key: "code", kind: "tool_task", tool_name: "code", status: "completed" },
            structured_content: false,
            content: [],
            output: key === "mcp" ? "Wrote /remote/notes.md" : "first\nsecond\nthird",
          }),
          approve: async () => {
            approvals++
          },
        }),
      }),
    },
  } as unknown as Backend
  const { send, close } = await bridge(b)
  try {
    expect((await send("/chats?archived=1&after=cursor")).status).toBe(200)
    expect((await send("/chats")).status).toBe(200)
    expect(pages).toEqual(["archived/cursor/agent", "active//agent"])
    expect((await send("/chats/a/delete", {})).status).toBe(403)
    expect((await send("/chats/a/archive", {})).status).toBe(403)
    bound = false
    bot = true
    expect((await send("/chats/a/memory", { selection: { bindings: [] } })).status).toBe(403)
    expect(await (await send("/chats/a/memory")).json()).toMatchObject({ writable: false })
    expect((await send("/chats/a/archive", {})).status).toBe(403)
    expect(await (await send("/chats/a/modes")).json()).toBeNull()
    bot = false
    expect((await send("/chats/a/archive", {})).status).toBe(200)
    expect((await send("/chats/a/prepare", { text: "hello" })).status).toBe(409)
    expect((await send("/chats/a/restore", {})).status).toBe(200)
    for (const rid of ["other", "mine"]) {
      const status = rid === "mine" ? 200 : 404
      expect((await send("/chats/a/rounds?run=" + rid)).status).toBe(status)
      expect((await send("/chats/a/decisions", { run: rid, key: "k", response: { action: "approve" } })).status).toBe(
        status,
      )
    }
    expect(approvals).toBe(1)
    expect(executionReads).toBe(1)
    expect(await (await send("/chats/a/task?run=mine&key=mcp")).json()).toMatchObject({
      name: "research_write",
      captures: [],
      mcp: { connection: "work", account: "Research", tool: "write" },
    })
    expect(await (await send("/chats/a/task?run=mine&key=code")).json()).toMatchObject({
      output: "first\nsecond\nthird",
      structured: false,
    })
    expect((await send("/chats/a/promote", { id: "old", version: 4 })).status).toBe(409)
    expect((await send("/chats/a/promote", { id: "new", version: 4 })).status).toBe(200)
    expect(promoted).toEqual(["new"])
    expect((await send("/chats/a/files?turn=turn&variant=v1")).status).toBe(409)
    expect((await send("/chats/a/bytes?turn=turn&variant=v2&file=unknown")).status).toBe(404)
    const download = await send("/chats/a/bytes?turn=turn&variant=v2&file=published")
    expect(download.headers.get("Content-Disposition")).toContain("picture.png")
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([0, 255, 17])
    archived = true
    full = false
    expect(await (await send("/chats/a/options")).json()).toEqual({
      title: "Conversation", version: 2, archived: true, owned: false, writable: false,
    })
    expect((await send("/chats/a/delete", {})).status).toBe(403)
    expect(deletes).toBe(0)
    full = true
    expect((await send("/chats/a/delete", {})).status).toBe(200)
    expect(deletes).toBe(1)
  } finally {
    await close()
  }
})

test("run inspection offers cost-limit recovery only for the conversation's unresolved model refusal", async () => {
  const failure = {
    status: "failed",
    on_failure: "absorb",
    kind: "model_task",
    error: { key: "conversation_cost_limit_reached" },
  }
  const b = {
    origin: "https://nexus.example",
    workspaceID: "w",
    connection: { scope: "scope" },
    workspace: {
      conversation: (id: string) => ({ fetch: async () => ({ public_id: id, workspace_public_id: "w" }) }),
      run: () => ({
        graph: async () => ({ nodes: [] }),
        fetch: async () => ({
          status: "needs_attention",
          turn: { conversation_public_id: "chat" },
          tasks: [
            { ...failure, key: "model" },
            { ...failure, key: "tool", kind: "tool_task" },
            { ...failure, key: "resolved", failure_resolution: "abandoned" },
            { ...failure, key: "ordinary", error: { key: "model_unavailable" }, on_failure: "propagate" },
          ],
        }),
      }),
    },
  } as unknown as Backend
  const { send, close } = await bridge(b)
  try {
    expect((await send("/chats/other/run?run=r")).status).toBe(404)
    const run = await (await send("/chats/chat/run?run=r")).json()
    expect(
      run.tasks.map((task: { key: string; unresolved: boolean; costLimitUrl?: string }) => [
        task.key,
        task.unresolved,
        task.costLimitUrl,
      ]),
    ).toEqual([
      ["model", true, "https://nexus.example/conversations/chat/cost_limit/edit"],
      ["tool", false, undefined],
      ["resolved", false, undefined],
      ["ordinary", true, undefined],
    ])
  } finally {
    await close()
  }
})

test("context overflow guidance follows the unresolved model task in the run and task views", async () => {
  const error = { key: "provider_context_overflow", detail: "Requested 9000 tokens; maximum 8192. <div>" }
  const failed = { status: "failed", kind: "model_task", on_failure: "halt", error }
  const tasks = [
    { ...failed, key: "held" },
    { ...failed, key: "absorbed", on_failure: "absorb" },
    { ...failed, key: "resolved", failure_resolution: "retried" },
    { ...failed, key: "running", status: "running" },
    { ...failed, key: "tool", kind: "tool_task" },
  ]
  const b = {
    workspaceID: "w",
    connection: { scope: "scope" },
    workspace: {
      conversation: (id: string) => ({ fetch: async () => ({ public_id: id, workspace_public_id: "w" }) }),
      run: () => ({
        graph: async () => ({ nodes: [] }),
        fetch: async () => ({ status: "needs_attention", turn: { conversation_public_id: "chat" }, tasks }),
        task: (key: string) => ({ fetch: async () => ({ task: tasks.find((t) => t.key === key) }) }),
      }),
    },
  } as unknown as Backend
  const { send, close } = await bridge(b)
  try {
    const run = await (await send("/chats/chat/run?run=r")).json()
    for (const t of run.tasks) {
      const detail = await (await send("/chats/chat/task?run=r&key=" + t.key)).json()
      expect(t.contextOverflow).toBe(t.key === "held")
      expect(detail.contextOverflow).toBe(t.key === "held")
      expect(detail.error).toEqual(error)
    }
  } finally {
    await close()
  }
})

test("context inspection returns only system text and reads raw records within the selected conversation", async () => {
  const raw = { public_id: "turn", role: "assistant", active_variant: { content: "Recorded response" } }
  const reads: string[] = []
  const b = {
    workspaceID: "workspace",
    connection: { scope: "scope" },
    workspace: {
      conversation: (id: string) => ({
        fetch: async () => ({ public_id: id, workspace_public_id: id === "other" ? "different" : "workspace" }),
        turns: {
          fetch: async (turn: string) => {
            reads.push(`${id}/${turn}`)
            return raw
          },
          request: async (turn: string, variant: string) => {
            reads.push(`${id}/${turn}/${variant}`)
            if (variant === "pruned")
              throw new APIError("Expired", 410, "execution_details_pruned", null, null, null)
            return {
              entries: [
                { role: "system", parts: [{ type: "text", text: "First instruction" }, { type: "image" }] },
                { role: "user", parts: [{ type: "text", text: "Human input" }] },
                { role: "system", parts: [{ type: "text", text: "Second instruction" }] },
              ],
            }
          },
        },
      }),
    },
  } as unknown as Backend
  const { send, close } = await bridge(b)
  try {
    expect((await send("/chats/a/system-prompt?turn=turn")).status).toBe(400)
    expect((await send("/chats/other/raw-message?turn=turn")).status).toBe(404)
    expect(await (await send("/chats/a/system-prompt?turn=turn&variant=variant")).json()).toBe(
      "First instruction\n\nSecond instruction",
    )
    expect(await (await send("/chats/a/system-prompt?turn=turn&variant=pruned")).json()).toBeNull()
    expect(await (await send("/chats/a/raw-message?turn=turn")).json()).toEqual(raw)
    expect(reads).toEqual(["a/turn/variant", "a/turn/pruned", "a/turn"])
  } finally {
    await close()
  }
})

test("the bridge prepares and submits through runtime admission with Human authority and no client tool policy", async () => {
  let access = "full",
    owned = false
  const commands: unknown[] = [],
    patches: unknown[] = []
  const info = (id: string) => ({
    public_id: id,
    workspace_public_id: "w",
    metadata: { "opencode.surface": owned ? "channel" : "desktop" },
    answering_user_public_id: "agent",
    access: { default: "full", entries: [{ user_public_id: "human", level: access }] },
    default_runner: { executor_public_id: "runner" },
  })
  const backend = {
    connection: { scope: "scope", model: "configured" },
    workspaceID: "w",
    humanID: "human",
    workspaceActive: true,
    agentID: "agent",
    localRunner: "runner",
    fallbackModels: [],
    workspace: {
      conversation: (id: string) => ({
        fetch: async () => info(id),
      }),
    },
    native: {
      manage: async (input: { payload: { action: string } }) => {
        commands.push(input)
        return input.payload.action === "application.prepare" ? null : { input: { public_id: "receipt" } }
      },
      modes(input: unknown) {
        patches.push(input)
        return { code_mode: false, subagent: true }
      },
    },
  } as unknown as Backend
  const { send, close } = await bridge(backend)
  try {
    const body = { key: "one", text: "hello", model: null, speaker_public_id: "spoof", tool_names: ["forged"] }
    const r = await send("/chats/a/prepare", body)
    expect(r.status).toBe(200)
    const { ticket } = await r.json()
    expect((await send("/chats/a/modes", { subagent: true })).status).toBe(200)
    expect(patches).toEqual([{ conversation: "a", workspace: "w", patch: { subagent: true } }])
    for (let i = 0; i < 2; i++) expect((await send("/chats/a/inputs", { ...body, ticket })).status).toBe(202)
    expect(commands).toHaveLength(3)
    expect(commands[1]).toEqual(commands[2])
    expect(commands[0]).toEqual({
      "x-nexus-origin": "https://nexus.example",
      "x-nexus-member-token": "test",
      payload: {
        action: "application.prepare",
        key: "one",
        workspace: "w",
        conversation: "a",
        text: "hello",
        model: undefined,
        approval: "ask",
        delivery: undefined,
        target: undefined,
      },
    })
    expect(commands[1]).toEqual({
      ...(commands[0] as object),
      payload: {
        action: "application.submit",
        key: "one",
        workspace: "w",
        conversation: "a",
        text: "hello",
        model: undefined,
        approval: "ask",
        delivery: undefined,
        target: undefined,
      },
    })
    expect((await send("/chats/b/inputs", { ...body, ticket })).status).toBe(409)
    const next = { ...body, key: "two", clearModel: true }
    expect((await send("/chats/a/inputs", { ...body, clearModel: true, ticket })).status).toBe(409)
    expect((await send("/chats/a/prepare", { ...next, model: "explicit/route" })).status).toBe(400)
    const nextTicket = await (await send("/chats/a/prepare", next)).json()
    expect((await send("/chats/a/inputs", { ...next, ...nextTicket })).status).toBe(202)
    expect((await send("/chats/a/modes", { tool_names: [] })).status).toBe(400)
    for (const level of ["read", "none", "full"]) {
      access = level
      owned = level === "full"
      expect((await send("/chats/a/modes", { subagent: false })).status).toBe(403)
      expect((await send("/chats/a/prepare", body)).status).toBe(403)
    }
    expect(patches).toHaveLength(1)
    expect(commands).toHaveLength(5)
    expect(commands.slice(-2)).toMatchObject([{ payload: { model: null } }, { payload: { model: null } }])
  } finally {
    await close()
  }
})
