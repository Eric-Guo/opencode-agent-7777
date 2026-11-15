import { expect, test } from "bun:test"
import { Client } from "@cybros/agent"
import { RealtimeClient } from "@cybros/agent/realtime"
import { manage } from "./management"
import { defaultModes } from "./input-policy"
import { nexusService } from "./native"
import type { Backend } from "./nexus"

test("management binds Human platform calls and workspace reads without exposing credentials", async () => {
  const calls: unknown[] = []
  const reads: string[] = []

  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname.startsWith("/agent_api/")) {
        expect(request.headers.get("authorization")).toBe("Bearer human-token")
        reads.push(url.pathname + url.search)

        if (url.pathname.endsWith("/conversations/conversation"))
          return Response.json({
            conversation: {
              public_id: "conversation",
              workspace_public_id: "workspace",
              answering_user_public_id: "other",
              archived_at: "now",
              side: false,
              lock_version: 0,
              context_revision: 0,
              created_at: "now",
              updated_at: "now",
              metadata: { "opencode.bot": "private" },
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
      const body = await request.json()
      calls.push(body)

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
  expect(await manage(b, config, { action: "workspace.list" })).toEqual({ saved: true })
  expect(calls).toEqual([{ action: "workspace.list" }])
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
