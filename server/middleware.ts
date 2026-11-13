import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { activityRead, execution, field, ownedRun } from "./activity"
import { fileBytes, outputs, outputTurn, review, restoreReview } from "./outputs"
import type { ServiceConnection } from "./native"
import { isIP } from "node:net"
import type { Connect } from "vite"
import { APIError } from "@cybros/agent"
import {
  BridgeError,
  discoverNative,
  canWrite,
  grantSite,
  ownership,
  readChat,
  resolveDecision,
  snapshot,
  type Backend,
} from "./nexus"
import { modelFields, openReply, sealReply, submitReply } from "./reply"
import { defaultModes, inputPolicy, readModes, updateModes } from "./input-policy"
import { projectFrame, type Choices, type Resolution } from "../src/nexus/chat"

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

export type BridgeConfig = {
  token?: string
  native?: { origin: string; connection: () => Promise<ServiceConnection> }
}

export function middleware(
  env: () => BridgeConfig | Promise<BridgeConfig>,
  connect = discoverNative,
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (!url.pathname.startsWith(root + "/")) return next()
    try {
      if (!localRequest(req)) throw new BridgeError(403, "Local same-origin requests only.")
      const config = await env()
      const b = await connect(config.native, config.token)
      const route = url.pathname.slice(root.length)
      if (req.method === "GET" && route === "/connection") return json(res, 200, b.connection)
      const scope = req.headers["x-7777-scope"]
        ? decodeURIComponent(String(req.headers["x-7777-scope"]))
        : url.searchParams.get("scope")
      if (scope !== b.connection.scope)
        throw new BridgeError(409, "The active Nexus identity or workspace changed. Reconnect.")
      const body = req.method === "POST" ? await payload(req) : undefined
      if (route === "/choices" && req.method === "GET") {
        const [models, runners] = await Promise.all([b.client.models.list({ workload: "text_generation" }), b.native.runners()])
        return json(res, 200, {
          models: models.filter((m) => m.available && m.visible).map((m) => m.ref),
          runners: [...runners],
          approvals: ["ask", "rules"],
          modes: defaultModes,
        } satisfies Choices)
      }
      if (route === "/chats" && req.method === "GET") {
        const archived = url.searchParams.get("archived") === "1"
        const list = b.workspace.conversations
        const query = {
          answering_user_public_id: b.agentID,
          side: false,
          order: "desc" as const,
          order_by: "last_activity_at" as const,
          limit: 12,
          after: url.searchParams.get("after") ?? undefined,
        }
        const page = archived ? await list.archived(query) : await list.list(query)
        const attention = new Set<string>()
        let after: string | undefined
        do {
          const rows = await b.client.work.attention({ workspace_public_id: b.workspaceID, view: "actionable", after })
          for (const row of rows.items) if (row.conversation_public_id) attention.add(row.conversation_public_id)
          after = rows.next_after ?? undefined
        } while (after)
        return json(res, 200, {
          items: page.items
            .filter((row) => !row.side && !row.parent && row.answering_user_public_id === b.agentID)
            .map((row) => ({
              id: row.public_id,
              working: !!row.active_turn_public_id,
              attention: attention.has(row.public_id),
              title: row.title ?? "",
              time: {
                created: Date.parse(row.created_at),
                updated: Date.parse(row.last_activity_at ?? row.updated_at),
              },
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
        if (body.runner !== null && !(await b.native.runners()).some((runner) => runner.id === body.runner))
          throw new BridgeError(400, "Unknown native runner.")
        const receipt = await b.workspace.conversations.create(
          {
            metadata: { "opencode.surface": "desktop" },
            title: body.title,
            answering_user_public_id: b.agentID,
            default_runner_executor_public_id: body.runner,
          },
          { idempotencyKey: body.key },
        )
        return json(res, 201, { id: receipt.conversation.public_id })
      }
      const match = /^\/chats\/([\w-]+)(?:\/([a-z-]+))?$/.exec(route)
      if (!match) throw new BridgeError(404, "Unknown chat route.")
      const [, id, action] = match
      if (!action && req.method === "GET") return json(res, 200, await snapshot(b, id!))
      const { chat, info } = await readChat(b, id!)
      if (action === "stream" && req.method === "GET") return await stream(b, id!, res)
      if (req.method === "GET") {
        if (action === "modes") {
          if (!canWrite(b, info) || ownership(info)) return json(res, 200, null)
          return json(res, 200, await readModes(b, id!))
        }
        if (action === "files" || action === "review") {
          const turn = await outputTurn(b, info, url.searchParams)
          return json(res, 200, await (action === "files" ? outputs(b, info, turn) : review(b, info, turn)))
        }
        if (action === "bytes") {
          const file = await fileBytes(b, info, url.searchParams)
          res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.name),
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          })
          if (file.body) await pipeline(Readable.from(file.body as AsyncIterable<Uint8Array>), res)
          else res.end()
          return
        }
        return json(res, 200, await activityRead(b, info, action!, url.searchParams))
      }
      if (req.method !== "POST") throw new BridgeError(405, "Expected POST.")
      if (action !== "stop") {
        if (ownership(info)) throw new BridgeError(403, "Continue this conversation in its channel.")
        if (info.archived_at && !["restore", "rename"].includes(action!))
          throw new BridgeError(409, "Restore this conversation first.")
      }
      if (action === "restore-files") {
        if (!canWrite(b, info)) throw new BridgeError(403, "Write access is required to restore files.")
        const turn = await outputTurn(b, info, url.searchParams)
        await restoreReview(b, info, turn, field(body.task, "task"), field(body.receipt, "receipt"))
        return json(res, 200, {})
      }
      if (action === "modes" || action === "prepare") {
        if (!canWrite(b, info)) throw new BridgeError(403, "This Human needs write access to the conversation.")
        if (action === "modes") return json(res, 200, await updateModes(b, id!, body))
      }
      if (action === "inputs" || action === "prepare") {
        if (typeof body.text !== "string" || !body.text.trim()) throw new BridgeError(400, "Enter a message.")
        if (!body.key || typeof body.key !== "string" || (body.model !== null && typeof body.model !== "string"))
          throw new BridgeError(400, "Missing input key or model.")
        if (
          (body.delivery !== undefined && !["steer", "steer_now", "queue"].includes(body.delivery)) ||
          (body.approval !== undefined && !["ask", "bypass", "rules"].includes(body.approval)) ||
          (body.target !== undefined && typeof body.target !== "string")
        )
          throw new BridgeError(400, "Invalid send options.")
        const submission = {
          key: body.key,
          model: body.model,
          text: body.text,
          delivery: body.delivery,
          approval: body.approval,
          target: body.target,
        }
        if (action === "prepare") {
          if (submission.approval === "bypass") throw new BridgeError(403, "This installation requires approval.")
          const context = { ...(await inputPolicy(b, id!)), ...modelFields(submission.model, b.connection.model, b.fallbackModels) }
          return json(res, 200, { ticket: sealReply(config.token!, b.connection.scope, info, submission, context) })
        }
        if (typeof body.ticket !== "string") throw new BridgeError(400, "Prepare the reply before sending.")
        const input = openReply(config.token!, b.connection.scope, info, submission, body.ticket)
        const result = await submitReply(input, (fields) =>
          chat.inputs.create(fields, { idempotencyKey: submission.key }),
        )
        return json(res, 202, { id: result.input.public_id })
      }
      if (action === "stop") await chat.cancel()
      else if (action === "rename") {
        if (!Number.isSafeInteger(body.version)) throw new BridgeError(400, "Missing conversation version.")
        await chat.update({ title: field(body.title, "title").trim(), lock_version: body.version })
      } else if (action === "archive") await chat.archive()
      else if (action === "restore") await chat.unarchive()
      else if (action === "execution") await execution(b, info, body)
      else if (action === "promote") {
        const candidates = (await chat.inputs.list()).items
          .filter((i) => i.state === "steering" && i.delivery_mode === "steer")
          .sort((a, b) => a.queue_position - b.queue_position)
        const input = candidates.at(-1)
        if (!input || input.public_id !== body.id || input.lock_version !== body.version)
          throw new BridgeError(409, "Waiting inputs changed. Refresh and try again.")
        await chat.inputs.update(input.public_id, {
          delivery_mode: "steer_now",
          expected_lock_version: input.lock_version,
        })
      } else if (action === "decisions") {
        if (typeof body.run !== "string" || typeof body.key !== "string" || !body.response)
          throw new BridgeError(400, "Invalid task decision.")
        const { run } = await ownedRun(b, id!, body.run)
        if (body.response.action === "site") {
          const detail = await run.task(body.key).fetch()
          if (!canWrite(b, info) || detail.task.target?.executor_public_id !== b.localRunner || !grantSite(detail)) throw new BridgeError(403, "This site grant is unavailable.")
          await run.task(body.key).approve()
          const retained = await b.native.grant({ workspace: b.workspaceID, conversation: id!, run: body.run, task: body.key }).then(() => true, () => false)
          return json(res, 200, { notice: retained ? undefined : "Approved this call. The site grant could not be saved for this session." })
        }
        await resolveDecision(run.task(body.key), body.response as Resolution)
      } else throw new BridgeError(404, "Unknown chat action.")
      json(res, 200, {})
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.end()
      if (error instanceof BridgeError) return json(res, error.status, { error: error.message })
      if (error instanceof APIError)
        return json(res, error.status, {
          error:
            error.code === "not_a_branch"
              ? "This step belongs to the main reply. Use Stop all work."
              : "Nexus: " + (error.code || error.status),
        })
      json(res, 503, {
        error: "Could not complete the Nexus request. Check the OpenCode Nexus connection.",
      })
    }
  }
}
