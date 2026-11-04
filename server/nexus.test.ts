import { expect, test } from "bun:test"
import type { IncomingMessage } from "node:http"
import { localRequest } from "./middleware"
import { resolveDecision } from "./nexus"
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

test("discovery separates the two credentials and refuses a workspace the Human cannot read", async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { discover } = await import("./nexus")
  const calls: [string, string | null][] = []
  const service = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      calls.push([path, req.headers.get("authorization")])
      if (path === "/status")
        return Response.json({
          identity: { user_public_id: "rho" },
          workspace: { public_id: "workspace", name: "Workspace" },
          profile: { default_model: "model" },
        })
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
      return Response.json({ error: { code: "not_authorized", message: "Denied" } }, { status: 403 })
    },
  })
  const home = await mkdtemp(join(tmpdir(), "7777-rho-"))
  try {
    await mkdir(join(home, "tmp"))
    await writeFile(
      join(home, "tmp", "announcement.json"),
      JSON.stringify({
        state: "active",
        endpoint: service.url.origin,
        base_url: service.url.origin,
        bearer: "daemon-test",
      }),
    )
    await expect(discover(home, "human-test")).rejects.toMatchObject({ status: 403 })
    expect(calls).toEqual([
      ["/status", "Bearer daemon-test"],
      ["/agent_api/v1/profile", "Bearer human-test"],
      ["/agent_api/v1/workspaces/workspace", "Bearer human-test"],
    ])
  } finally {
    service.stop(true)
    await rm(home, { recursive: true, force: true })
  }
})
