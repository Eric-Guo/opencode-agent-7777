import type { IncomingMessage, ServerResponse } from "node:http"
import { isIP } from "node:net"
import type { Connect, Plugin } from "vite"
import { APIError } from "@cybros/agent"
import { BridgeError, discover, readChat, resolveDecision, snapshot, type Backend } from "./nexus"
import { projectFrame, type Resolution } from "../src/nexus/chat"

const root = "/api/7777"
function loopback(address = "") {
  const ip = address.replace(/^::ffff:/, "")
  return ip === "::1" || (isIP(ip) === 4 && ip.startsWith("127."))
}
export function localRequest(req: IncomingMessage) {
  const host = req.headers.host
  if (!host || !loopback(req.socket.remoteAddress)) return false
  const allowed = ["localhost", "127.0.0.1", "[::1]"].map((name) => name + ":" + req.socket.localPort)
  if (!allowed.includes(host) || req.headers["sec-fetch-site"] === "cross-site") return false
  const origin = req.headers.origin
  return origin === "http://" + host || (!origin && req.method === "GET")
}

async function payload(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new BridgeError(415, "Expected JSON.")
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024 * 1024) throw new BridgeError(413, "Message too large.")
    chunks.push(chunk)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString())
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
    throw new Error("Expected object")
  } catch {
    throw new BridgeError(400, "Invalid JSON.")
  }
}
function json(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" })
  res.end(JSON.stringify(data))
}
async function stream(backend: Backend, id: string, res: ServerResponse) {
  const rt = backend.realtime()
  const abort = new AbortController()
  const close = () => {
    abort.abort()
    void rt.close().catch(() => {})
  }
  res.once("close", close)
  try {
    const args = [backend.workspaceID, id, { signal: abort.signal }] as const
    const [frames, events] = await Promise.all([rt.conversationTranscript(...args), rt.conversationEvents(...args)])
    if (res.destroyed) return
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" })
    const send = (event: string, data: unknown) => {
      if (res.writableLength > 1024 * 1024) throw new Error("Stream consumer disconnected")
      res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n")
    }
    send("ready", {})
    await Promise.race([
      (async () => {
        for await (const item of frames) {
          const frame = projectFrame(item)
          if (frame) send("frame", frame)
        }
      })(),
      (async () => {
        for await (const event of events) send("refresh", event.type)
      })(),
    ])
  } finally {
    close()
    if (res.headersSent) res.end()
  }
}

export function middleware(env: () => { token?: string; home?: string }): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (!url.pathname.startsWith(root + "/")) return next()
    try {
      if (!localRequest(req)) throw new BridgeError(403, "Local same-origin requests only.")
      const config = env()
      const b = await discover(config.home ?? "", config.token)
      const route = url.pathname.slice(root.length)
      if (req.method === "GET" && route === "/connection") return json(res, 200, b.connection)
      const scope = req.headers["x-7777-scope"]
        ? decodeURIComponent(String(req.headers["x-7777-scope"]))
        : url.searchParams.get("scope")
      if (scope !== b.connection.scope)
        throw new BridgeError(409, "The active Nexus identity or workspace changed. Reconnect.")
      const body = req.method === "POST" ? await payload(req) : undefined
      if (route === "/chats" && req.method === "GET") {
        const page = await b.workspace.conversations.list({
          answering_user_public_id: b.agentID,
          side: false,
          order: "desc",
          order_by: "last_activity_at",
          limit: 12,
          after: url.searchParams.get("after") ?? undefined,
        })
        return json(res, 200, {
          items: page.items.map((row) => ({
            id: row.public_id,
            title: row.title ?? "",
            time: { created: Date.parse(row.created_at), updated: Date.parse(row.last_activity_at ?? row.updated_at) },
          })),
          next: page.next_after,
        })
      }
      if (route === "/chats" && req.method === "POST") {
        if (
          typeof body.title !== "string" ||
          !body.title.trim() ||
          typeof body.key !== "string" ||
          !body.key ||
          (body.runner !== null && typeof body.runner !== "string")
        )
          throw new BridgeError(400, "Invalid conversation request.")
        const receipt = await b.workspace.conversations.create(
          { title: body.title, answering_user_public_id: b.agentID, default_runner_executor_public_id: body.runner },
          { idempotencyKey: body.key },
        )
        return json(res, 201, { id: receipt.conversation.public_id })
      }
      const match = /^\/chats\/([\w-]+)(?:\/(stream|inputs|stop|decisions))?$/.exec(route)
      if (!match) throw new BridgeError(404, "Unknown chat route.")
      const [, id, action] = match
      if (!action && req.method === "GET") return json(res, 200, await snapshot(b, id!))
      const { chat } = await readChat(b, id!)
      if (action === "stream" && req.method === "GET") return await stream(b, id!, res)
      if (req.method !== "POST") throw new BridgeError(405, "Expected POST.")
      if (action === "inputs") {
        if (typeof body.text !== "string" || !body.text.trim()) throw new BridgeError(400, "Enter a message.")
        if (!body.key || typeof body.key !== "string" || !body.model || typeof body.model !== "string")
          throw new BridgeError(400, "Missing input key or model.")
        const result = await chat.inputs.create(
          { kind: "direct_reply", text: body.text, model: { model: body.model } },
          { idempotencyKey: body.key },
        )
        return json(res, 202, { id: result.input.public_id })
      }
      if (action === "stop") await chat.cancel()
      else if (action === "decisions") {
        if (typeof body.run !== "string" || typeof body.key !== "string" || !body.response)
          throw new BridgeError(400, "Invalid task decision.")
        const run = b.workspace.run(body.run)
        if ((await run.fetch()).turn?.conversation_public_id !== id)
          throw new BridgeError(404, "Unknown conversation task.")
        await resolveDecision(run.task(body.key), body.response as Resolution)
      } else throw new BridgeError(404, "Unknown chat action.")
      json(res, 200, {})
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.end()
      if (error instanceof BridgeError) return json(res, error.status, { error: error.message })
      if (error instanceof APIError) return json(res, error.status, { error: "Nexus: " + (error.code || error.status) })
      json(res, 503, { error: "Could not reach rho or Nexus. Check rho status and reconnect." })
    }
  }
}
export function nexusPlugin(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: "7777-nexus",
    async configResolved(config) {
      const { loadEnv } = await import("vite")
      env = loadEnv(config.mode, config.envDir, ["NEXUS_MEMBER_TOKEN", "RHO_HOME"])
    },
    configureServer(server) {
      server.middlewares.use(middleware(() => ({ token: env.NEXUS_MEMBER_TOKEN, home: env.RHO_HOME })))
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(() => ({ token: env.NEXUS_MEMBER_TOKEN, home: env.RHO_HOME })))
    },
  }
}
