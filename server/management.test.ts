import { expect, test } from "bun:test"
import { Client } from "@cybros/agent"
import { RealtimeClient } from "@cybros/agent/realtime"
import { manage } from "./management"
import { nexusService } from "./native"
import type { Backend } from "./nexus"

test("management binds Human platform calls and workspace reads without exposing credentials", async () => {
  const calls: unknown[] = []

  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      expect(request.headers.get("authorization")).toBe("Basic " + btoa("opencode:service-password"))
      expect(request.headers.get("x-nexus-member-token")).toBe("human-token")
      calls.push(await request.json())

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
})
