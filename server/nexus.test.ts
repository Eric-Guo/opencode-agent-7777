import { expect, test } from "bun:test"
import type { IncomingMessage } from "node:http"
import { localRequest } from "./middleware"
import { grantSite, resolveDecision } from "./nexus"
import { answerFields } from "../src/nexus/decision"

test("only the active loopback origin may post commands", () => {
  const req = (origin?: string, host = "localhost:4777", remoteAddress = "127.0.0.1", method = "POST") =>
    ({ headers: { host, origin }, method, socket: { remoteAddress, localPort: 4777 } }) as IncomingMessage
  expect(localRequest(req("http://localhost:4777"))).toBe(true)
  expect(localRequest(req(undefined, "localhost:4777", "::1", "GET"))).toBe(true)
  expect(localRequest(req(undefined))).toBe(false)
  expect(localRequest(req("http://localhost:4778"))).toBe(false)
  expect(localRequest(req("http://malicious.example:4777", "malicious.example:4777"))).toBe(false)
  expect(localRequest(req("http://localhost:4777", "localhost:4777", "192.168.1.5"))).toBe(false)
})

test("typed answers preserve zero, false, empty lists, and omitted fields; approvals use distinct task commands", async () => {
  const data = new FormData()
  data.set("value:count", "0")
  data.set("value:enabled", "false")
  data.set("include:choices", "on")
  data.set("value:skip", "discard")
  const fields = [
    ["count", "integer", true],
    ["enabled", "boolean", true],
    ["choices", "multichoice", false],
    ["skip", "string", false],
  ] as const
  const answer = answerFields(
    fields.map(([name, type, required]) => ({ name, type, required, label: name })),
    data,
  )
  expect(answer).toEqual({ count: 0, enabled: false, choices: [] })
  const calls: unknown[] = []
  const task = {
    approve: async () => calls.push("approve"),
    deny: async () => calls.push("deny"),
    resolve: async (input: unknown) => calls.push(input),
  }
  await resolveDecision(task, { action: "answer", answer })
  await resolveDecision(task, { action: "answer", answer: "hello" })
  await resolveDecision(task, { action: "approve" })
  await resolveDecision(task, { action: "deny" })
  expect(calls).toEqual([
    { answer: { count: 0, enabled: false, choices: [] } },
    { content: "hello" },
    "approve",
    "deny",
  ])
})

test("discovery checks workspace access and sends only the Human credential for task decisions", async () => {
  const { discoverNative } = await import("./nexus")
  const calls: [string, string | null][] = []
  let readable = false
  const service = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      calls.push([path, req.headers.get("authorization")])
      if (path === "/api/experimental/nexus/status")
        return Response.json({ state: "ready", origin: new URL(req.url).origin, model: "model", directory: "/project", workspace: "workspace", identity: { agent: "agent", name: "OpenCode", runner: "runner", workspace: "workspace", workspaceName: "Workspace" } })
      if (path === "/agent_api/v1/profile")
        return Response.json({
          member: {
            public_id: "human",
            kind: "human",
            role: "member",
            handle: "human",
            display_name: "Human",
            agent_identifier: null,
          },
          credential: { plane: "member", expires_at: null },
          configuration: null,
          measured_at: "2026-11-01T00:00:00Z",
        })
      if (readable && path === "/agent_api/v1/workspaces/workspace")
        return Response.json({
          workspace: {
            public_id: "workspace",
            name: "Workspace",
            state: "active",
            access_mode: "private",
            dedicated: false,
            lock_version: 1,
            created_at: "now",
            updated_at: "now",
            metadata: {},
            tool_provider_overrides: {},
            owner: { public_id: "human" },
            creator: { public_id: "human", kind: "human" },
          },
        })
      if (readable && path.startsWith("/agent_api/v1/workspaces/workspace/runs/run/tasks/bash/"))
        return Response.json({
          task: {
            key: "bash",
            kind: "tool",
            status: path.endsWith("/deny") ? "failed" : "dispatched",
            lifetime: "turn",
            wake: "immediate",
            after: [],
            waiting_on: [],
            approval: { origin: "human" },
          },
        })
      return Response.json({ error: { code: "not_authorized", message: "Denied" } }, { status: 403 })
    },
  })
  const config = { origin: service.url.origin, connection: async () => ({ url: service.url.origin, password: "fixture" }) }
  try {
    await expect(discoverNative({ ...config, origin: "https://other.example" }, "human-test")).rejects.toMatchObject({ status: 503 })
    expect(calls.splice(0).map(([path]) => path)).toEqual(["/api/experimental/nexus/status"])
    await expect(discoverNative(config, "human-test")).rejects.toMatchObject({ status: 403 })
    expect(calls).toEqual([
      ["/api/experimental/nexus/status", "Basic " + Buffer.from("opencode:fixture").toString("base64")],
      ["/agent_api/v1/profile", "Bearer human-test"],
      ["/agent_api/v1/workspaces/workspace", "Bearer human-test"],
    ])
    readable = true
    const backend = await discoverNative(config, "human-test")
    const task = backend.workspace.run("run").task("bash")
    for (const action of ["approve", "deny"] as const) await resolveDecision(task, { action })
    expect(calls.slice(-2)).toEqual([
      ["/agent_api/v1/workspaces/workspace/runs/run/tasks/bash/approve", "Bearer human-test"],
      ["/agent_api/v1/workspaces/workspace/runs/run/tasks/bash/deny", "Bearer human-test"],
    ])
  } finally {
    service.stop(true)
  }
})

test("only native web_fetch approvals with a literal HTTP site can be retained", () => {
  const held = (url: string, kind = "builtin", status = "needs_approval") =>
    grantSite({ task: { tool_name: "web_fetch", target: { kind }, status }, tool_input: { url } })
  expect(held("https://EXAMPLE.test:443/reports?a=1")).toBe("https://EXAMPLE.test:443")
  expect(held("https://user:pass@example.test/data")).toBeUndefined()
  expect(held("http://*.example.test/data")).toBeUndefined()
  expect(held("file:///etc/hosts")).toBeUndefined()
  expect(held("https://example.test/data", "mcp")).toBeUndefined()
  expect(held("https://example.test/data", "builtin", "completed")).toBeUndefined()
})
