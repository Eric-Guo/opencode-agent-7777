import { expect, test } from "bun:test"
import { Client } from "@cybros/agent"
import { RealtimeClient } from "@cybros/agent/realtime"
import { manage } from "./management"
import { defaultModes } from "./input-policy"
import { nexusService } from "./native"
import { terminal } from "./terminal"
import type { Backend } from "./nexus"

test("management binds Human platform calls and workspace reads without exposing credentials", async () => {
  const calls: unknown[] = []
  const reads: string[] = []
  const terminalTask = {
    key: "terminal",
    kind: "tool_call",
    tool_name: "terminal",
    status: "running",
    lifetime: "run",
    wake: "none",
    visibility: "public",
  }

  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname.startsWith("/agent_api/")) {
        expect(request.headers.get("authorization")).toBe("Bearer human-token")
        reads.push(url.pathname + url.search)

        if (url.pathname.endsWith("/runs"))
          return Response.json({
            runs: [{ public_id: "terminal-run", status: "running" }],
            pagination: { next_after: "older-terminal" },
          })

        if (url.pathname.endsWith("/runs/terminal-run"))
          return Response.json({
            run: {
              public_id: "terminal-run",
              status: "running",
              turn: { status: "running" },
              created_at: "now",
              tasks: [terminalTask],
            },
          })

        if (url.pathname.endsWith("/runs/terminal-run/stop")) {
          expect(request.method).toBe("POST")
          expect(await request.json()).toEqual({ force: true })

          return Response.json({ run: { public_id: "terminal-run", status: "stopped", turn: { status: "stopped" } } })
        }

        if (url.pathname.endsWith("/runs/conversation-run") || url.pathname.endsWith("/runs/read-only-run"))
          return Response.json({
            run: {
              public_id: url.pathname.split("/").at(-1),
              status: "running",
              turn: {
                status: "running",
                conversation_public_id: url.pathname.endsWith("/read-only-run") ? "read-only" : "conversation",
              },
              tasks: [terminalTask],
            },
          })

        if (url.pathname.endsWith("/tasks/terminal/cancel")) {
          expect(request.method).toBe("POST")

          return Response.json({ task: { ...terminalTask, status: "canceled" } })
        }

        if (url.pathname.endsWith("/runs/foreign"))
          return Response.json({
            run: { public_id: "foreign", workspace_public_id: "other", status: "running", tasks: [terminalTask] },
          })

        if (url.pathname.endsWith("/tasks/terminal")) return Response.json({ task: terminalTask })

        if (url.pathname.endsWith("/conversations/conversation") || url.pathname.endsWith("/conversations/read-only"))
          return Response.json({
            conversation: {
              public_id: url.pathname.split("/").at(-1),
              workspace_public_id: "workspace",
              answering_user_public_id: url.pathname.endsWith("/read-only") ? "agent" : "other",
              archived_at: url.pathname.endsWith("/read-only") ? null : "now",
              side: false,
              lock_version: 0,
              context_revision: 0,
              created_at: "now",
              updated_at: "now",
              metadata: url.pathname.endsWith("/read-only") ? {} : { "opencode.bot": "private" },
              input_queue: { limit: 100, held: 0 },
              usage_summary: {
                request_count: 0,
                input_tokens: 0,
                cache_read_tokens: 0,
                uncached_input_tokens: 0,
                cache_creation_tokens: 0,
                output_tokens: 0,
                reasoning_tokens: 0,
                total_tokens: 0,
                cost_amount: "0",
                cost_complete: true,
              },
              access: { default: "read", entries: [] },
              effective_memory_context: {},
              agent_configuration_present: false,
              cost_limit_reached: false,
            },
          })

        if (url.pathname.endsWith("/executions"))
          return Response.json({ executions: [], pagination: { next_after: null, last_cursor: null } })

        return Response.json({ schedules: [], pagination: { next_after: null } })
      }

      expect(request.headers.get("authorization")).toBe("Basic " + btoa("opencode:service-password"))

      if (url.pathname === "/api/experimental/nexus/extensions") {
        expect(request.method).toBe("GET")
        reads.push(url.pathname)

        return Response.json([])
      }

      if (url.pathname === "/api/experimental/nexus/runners") return Response.json([{ id: "runner", name: "Local" }])

      const body = await request.json()
      calls.push(body)

      if (body.operation?.action === "terminal.open") {
        expect(request.headers.get("x-nexus-member-token")).toBeNull()

        return Response.json({ run: "terminal-run", task: "terminal" })
      }

      if (["terminal.realtime", "terminal.answer"].includes(body.operation?.action)) {
        expect(request.headers.get("x-nexus-member-token")).toBeNull()

        return Response.json({ status: "active" })
      }

      if (body.action === "extension.call" && body.name === "t3.create")
        return Response.json(
          { _tag: "InvalidRequestError", message: "Supply an absolute path in T3's execution environment." },
          { status: 400 },
        )

      if (body.action === "application.defaults")
        return Response.json({ code_mode: false, subagent: false, available: true, code_mode_available: false })
      expect(request.headers.get("x-nexus-member-token")).toBe("human-token")

      return Response.json({ saved: true })
    },
  })

  const client = new Client({ baseURL: server.url.origin, credential: "human-token" })

  const config = {
    token: "human-token",
    allowBypass: false,
    native: {
      origin: server.url.origin,
      connection: async () => ({ url: server.url.origin, password: "service-password" }),
    },
  }

  const b: Backend = {
    client,
    workspace: client.workspace("workspace"),
    workspaceID: "workspace",
    agentID: "agent",
    humanID: "human",
    connection: {
      scope: "scope",
      workspace: "workspace",
      agent: "Agent",
      user: "Human",
      model: "provider/model",
      runner: null,
    },
    native: nexusService(await config.native.connection()),
    workspaceActive: true,
    localRunner: null,
    fallbackModels: [],
    realtime: () => new RealtimeClient({ baseURL: server.url.origin, credential: "human-token" }),
  }

  await expect(
    manage(b, config, { action: "extension.call", name: "editor.auth.credential", input: {} }),
  ).rejects.toThrow("not exposed")
  await expect(
    manage(b, config, {
      action: "platform.request",
      principal: "other",
      path: "/api/v1/admin/model_providers",
      method: "GET",
    }),
  ).rejects.toThrow("account changed")
  await expect(manage(b, config, { action: "memory.collections", workspace: "other" })).rejects.toThrow(
    "Select this workspace",
  )
  await expect(
    manage(b, config, { action: "application.operation", operation: { action: "models", workspace: "other" } }),
  ).rejects.toThrow("Select this workspace")
  await expect(
    manage(b, config, {
      action: "application.operation",
      operation: { action: "participants", conversation: "conversation", entries: [] },
    }),
  ).rejects.toThrow("read-only")
  expect(calls).toEqual([])
  expect(await manage(b, config, { action: "extension.list" })).toEqual([])
  expect(reads.at(-1)).toBe("/api/experimental/nexus/extensions")
  expect(calls).toEqual([])
  expect(await manage(b, config, { action: "workspace.list" })).toEqual({ saved: true })
  expect(calls).toEqual([{ action: "workspace.list" }])
  await expect(
    manage(b, config, {
      action: "extension.call",
      name: "t3.create",
      input: { action: "t3.create", path: "relative" },
    }),
  ).rejects.toMatchObject({
    status: 400,
    message: "Supply an absolute path in T3's execution environment.",
  })
  expect(await defaultModes(b)).toEqual({
    code_mode: false,
    subagent: false,
    available: true,
    code_mode_available: false,
  })
  expect(await manage(b, config, { action: "schedule.list", conversation: "conversation" })).toMatchObject({
    items: [],
  })
  expect(
    await manage(b, config, { action: "schedule.executions", conversation: "conversation", id: "job", after: "older" }),
  ).toMatchObject({ items: [] })
  expect(reads.at(-1)).toEndWith("/schedules/job/executions?after=older")
  expect(await terminal(b, { action: "create", runner: "runner", key: "one-terminal" })).toEqual({
    run: "terminal-run",
    task: "terminal",
  })
  expect(calls.at(-1)).toEqual({
    action: "application.operation",
    workspace: "workspace",
    operation: { action: "terminal.open", runner: "runner", key: "one-terminal" },
  })
  const before = calls.length

  await expect(terminal(b, { action: "create", runner: "other", key: "bad" })).rejects.toThrow("Unknown runner")
  await expect(
    terminal({ ...b, workspaceActive: false }, { action: "create", runner: "runner", key: "bad" }),
  ).rejects.toThrow("active workspace")
  expect(calls).toHaveLength(before)
  expect(await terminal(b, undefined, "cursor")).toEqual({
    items: [{ run: "terminal-run", task: "terminal", status: "running", created: "now" }],
    next: "older-terminal",
  })
  expect(Object.fromEntries(new URL(reads.at(-2)!, server.url).searchParams)).toEqual({
    kind: "standalone",
    after: "cursor",
    limit: "50",
  })
  expect(reads.at(-1)).toBe("/agent_api/v1/workspaces/workspace/runs/terminal-run")
  expect(await terminal(b, { action: "read", run: "terminal-run", task: "terminal" })).toMatchObject({
    task: { key: "terminal", status: "running" },
    writable: true,
  })
  await expect(terminal(b, { action: "read", run: "foreign", task: "terminal" })).rejects.toThrow(
    "Unknown terminal workspace",
  )
  expect(await terminal(b, { action: "realtime", run: "terminal-run", task: "terminal" })).toEqual({ status: "active" })
  expect(calls.at(-1)).toEqual({
    action: "application.operation",
    workspace: "workspace",
    operation: { action: "terminal.realtime", run: "terminal-run", task: "terminal" },
  })
  expect(
    await terminal(b, {
      action: "answer",
      run: "terminal-run",
      task: "terminal",
      connection_id: "connection",
      sdp: "answer",
    }),
  ).toEqual({ status: "active" })
  expect(calls.at(-1)).toEqual({
    action: "application.operation",
    workspace: "workspace",
    operation: {
      action: "terminal.answer",
      run: "terminal-run",
      task: "terminal",
      connection_id: "connection",
      sdp: "answer",
    },
  })
  const signals = calls.length

  expect(await terminal(b, { action: "read", run: "conversation-run", task: "terminal" })).toMatchObject({
    writable: false,
  })
  expect(await terminal(b, { action: "read", run: "read-only-run", task: "terminal" })).toMatchObject({
    writable: false,
  })
  await expect(terminal(b, { action: "realtime", run: "conversation-run", task: "terminal" })).rejects.toThrow(
    "Write access",
  )
  await expect(terminal(b, { action: "realtime", run: "read-only-run", task: "terminal" })).rejects.toThrow(
    "Write access",
  )
  await expect(
    terminal(b, {
      action: "answer",
      run: "read-only-run",
      task: "terminal",
      connection_id: "connection",
      sdp: "answer",
    }),
  ).rejects.toThrow("Write access")
  await expect(
    terminal({ ...b, workspaceActive: false }, { action: "realtime", run: "terminal-run", task: "terminal" }),
  ).rejects.toThrow("Write access")
  expect(calls).toHaveLength(signals)
  expect(await terminal(b, { action: "stop", run: "terminal-run", task: "terminal" })).toMatchObject({
    public_id: "terminal-run",
    status: "stopped",
  })
  expect(reads.at(-1)).toBe("/agent_api/v1/workspaces/workspace/runs/terminal-run/stop")
  expect(await terminal(b, { action: "stop", run: "conversation-run", task: "terminal" })).toMatchObject({
    key: "terminal",
    status: "canceled",
  })
  expect(reads.at(-1)).toBe("/agent_api/v1/workspaces/workspace/runs/conversation-run/tasks/terminal/cancel")
  await expect(
    manage(b, config, {
      action: "extension.call",
      name: "memory-review.enable",
      input: { workspace: "workspace", conversation: "conversation" },
    }),
  ).rejects.toThrow("owning channel")
  await expect(
    manage(b, config, { action: "schedule.pause", conversation: "conversation", id: "job" }),
  ).rejects.toThrow("owning channel")
})
