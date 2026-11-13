import { expect, test } from "bun:test"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { middleware } from "./middleware"
import type { Backend } from "./nexus"

async function bridge(b: Backend) {
  const handle = middleware(
    () => ({ token: "test" }),
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

test("scoped bridge enforces channel ownership, archive state, run and file ownership", async () => {
  let bound = true,
    archived = false,
    approvals = 0,
    executionReads = 0
  const pages: string[] = [],
    promoted: string[] = []
  const info = () => ({
    public_id: "a",
    workspace_public_id: "w",
    answering_user_public_id: "agent",
    metadata: { "opencode.surface": bound ? "channel" : "desktop" },
    archived_at: archived ? "now" : null,
    side: false,
    access: { entries: [], default: "full" },
  })
  const chat = {
    fetch: async () => info(),
    archive: async () => {
      archived = true
    },
    unarchive: async () => {
      archived = false
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
        task: () => ({
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
    expect((await send("/chats/a/archive", {})).status).toBe(403)
    bound = false
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
    expect((await send("/chats/a/promote", { id: "old", version: 4 })).status).toBe(409)
    expect((await send("/chats/a/promote", { id: "new", version: 4 })).status).toBe(200)
    expect(promoted).toEqual(["new"])
    expect((await send("/chats/a/files?turn=turn&variant=v1")).status).toBe(409)
    expect((await send("/chats/a/bytes?turn=turn&variant=v2&file=unknown")).status).toBe(404)
    const download = await send("/chats/a/bytes?turn=turn&variant=v2&file=published")
    expect(download.headers.get("Content-Disposition")).toContain("picture.png")
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([0, 255, 17])
  } finally {
    await close()
  }
})

test("only the paired service’s prepared tools and contexts reach the Human SDK, including on receipt replay", async () => {
  let access = "full",
    owned = false
  let policy = {
    tools: [] as string[],
    directory: "/original" as string | null, runner: "runner" as string | null,
  }
  const preparations: unknown[] = [],
    patches: unknown[] = [],
    inputs: { fields: any; key: string }[] = []
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
        inputs: {
          create: (fields: unknown, options: { idempotencyKey: string }) => {
            inputs.push({ fields, key: options.idempotencyKey })
            return { input: { public_id: "receipt" } }
          },
        },
      }),
    },
    native: {
      policy(input: unknown) { preparations.push(input); return policy },
      modes(input: unknown) { patches.push(input); return { code_mode: false, subagent: true } },
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
    policy = { tools: ["code", "spawn"], directory: null, runner: null }
    for (let i = 0; i < 2; i++) expect((await send("/chats/a/inputs", { ...body, ticket })).status).toBe(202)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toEqual(inputs[1])
    expect(inputs[0]).toMatchObject({
      key: "one",
      fields: {
        kind: "direct_reply",
        text: "hello",
        tool_names: [],
        executor_contexts: { runner: { "opencode.directory": "/original" } },
      },
    })
    expect(inputs[0].fields).not.toHaveProperty("speaker_public_id")
    expect(preparations).toEqual([{ conversation: "a", workspace: "w" }])
    expect((await send("/chats/b/inputs", { ...body, ticket })).status).toBe(409)
    const next = { ...body, key: "two" }
    const nextTicket = await (await send("/chats/a/prepare", next)).json()
    expect((await send("/chats/a/inputs", { ...next, ...nextTicket })).status).toBe(202)
    expect(inputs[2].fields.tool_names).toEqual(["code", "spawn"])
    expect(inputs[2].fields).not.toHaveProperty("executor_contexts")
    expect((await send("/chats/a/modes", { tool_names: [] })).status).toBe(400)
    for (const level of ["read", "none", "full"]) {
      access = level
      owned = level === "full"
      expect((await send("/chats/a/modes", { subagent: false })).status).toBe(403)
      expect((await send("/chats/a/prepare", body)).status).toBe(403)
    }
    expect(patches).toHaveLength(1)
    expect(inputs).toHaveLength(3)
  } finally {
    await close()
  }
})
