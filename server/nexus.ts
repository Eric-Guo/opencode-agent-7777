import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { APIError, Client, type Conversation, type ResolveTask, type TaskDetail } from "@cybros/agent"
import { RealtimeClient } from "@cybros/agent/realtime"
import { loadTurns, type Connection, type Decision, type Resolution, type Snapshot } from "../src/nexus/chat"

export class BridgeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

type Workspace = ReturnType<Client["workspace"]>
export type Backend = {
  client: Client
  workspace: Workspace
  workspaceID: string
  agentID: string
  connection: Connection
  rhoGet: (path: string, init?: RequestInit) => Promise<Response>
  announcementPath: string
  humanID: string
  workspaceActive: boolean
  localRunner: string | null
  fallbackModels: string[]
  agentExecutor: string | null
  realtime: () => RealtimeClient
}
export async function discover(home: string, token?: string): Promise<Backend> {
  if (!token) throw new BridgeError(503, "Set NEXUS_MEMBER_TOKEN in .env.local to your Nexus personal member token.")
  const announcementPath = join(home || join(homedir(), ".rho"), "tmp", "announcement.json")
  const announcement = JSON.parse(await readFile(announcementPath, "utf8"))
  const endpoint = new URL(announcement.endpoint)
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
    endpoint.protocol !== "http:" ||
    announcement.state !== "active"
  )
    throw new BridgeError(503, "The local rho daemon is unavailable.")
  const rhoGet = (path: string, init?: RequestInit) =>
    fetch(new URL(path, endpoint), {
      ...init,
      headers: { ...init?.headers, Authorization: "Bearer " + announcement.bearer },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    })
  const status = await rhoGet("/status")
  if (!status.ok) throw new BridgeError(503, "Could not read local rho status.")
  const rho = await status.json()
  const workspaceID = rho.workspace?.public_id
  const agentID = rho.identity?.user_public_id
  const model = rho.profile?.default_model
  if (!workspaceID || !agentID || typeof model !== "string" || !model)
    throw new BridgeError(503, "rho needs a workspace, answering agent, and declared model.")
  const options = { baseURL: announcement.base_url as string, credential: token }
  const client = new Client(options)
  const profile = await client.profile.fetch()
  if (profile.member.kind !== "human")
    throw new BridgeError(403, "Use your Human member-plane token from Nexus personal token settings.")
  const workspace = client.workspace(workspaceID)
  const workspaceInfo = await workspace.fetch()
  const connection: Connection = {
    scope: JSON.stringify([options.baseURL, profile.member.public_id, workspaceID, agentID]),
    user: profile.member.display_name || profile.member.handle,
    agent: rho.identity.handle || "rho",
    workspace: rho.workspace.name,
    model,
    runner: rho.runner?.selected ?? rho.identity.runner_executor_public_id ?? null,
  }
  return {
    client,
    announcementPath,
    humanID: profile.member.public_id,
    workspaceActive: ["active", "restoring"].includes(workspaceInfo.state),
    workspace,
    workspaceID: workspaceID as string,
    agentID: agentID as string,
    connection,
    rhoGet,
    localRunner: rho.identity.runner_executor_public_id ?? null,
    fallbackModels: Array.isArray(rho.profile?.fallback_models) ? rho.profile.fallback_models : [],
    agentExecutor: rho.identity.executor_public_id ?? null,
    realtime: () => new RealtimeClient(options),
  }
}
export async function readChat(
  backend: Backend,
  id: string,
): Promise<{ chat: ReturnType<Workspace["conversation"]>; info: Conversation }> {
  const chat = backend.workspace.conversation(id)
  const info = await chat.fetch()
  if (
    info.answering_user_public_id !== backend.agentID ||
    info.side ||
    info.workspace_public_id !== backend.workspaceID
  )
    throw new BridgeError(404, "This conversation is outside the selected rho workspace.")
  return { chat, info }
}
// Nexus owns Human standing; rho also knows which conversations have live channel bindings.
export async function ownership(b: Backend, info: Conversation) {
  const query = new URLSearchParams({ public_id: info.public_id, workspace_public_id: b.workspaceID })
  const res = await b.rhoGet("/conversations/detail?" + query)
  if (!res.ok) throw new BridgeError(503, "Could not verify conversation ownership with rho.")
  const { conversation } = await res.json()
  if (
    conversation?.public_id !== info.public_id ||
    conversation.workspace_public_id !== b.workspaceID ||
    !Array.isArray(conversation.ingresses)
  )
    throw new BridgeError(503, "rho did not confirm conversation ownership.")
  return !!conversation.bot_public_id || conversation.ingresses.length > 0
}
export async function snapshot(backend: Backend, id: string): Promise<Snapshot> {
  const { chat, info } = await readChat(backend, id)
  // Unbounded turns.list starts at the oldest turn. A before-position window reads newest first.
  const [turns, inputs, owned] = await Promise.all([
    loadTurns((before_position) => chat.turns.list({ before_position: before_position ?? 2_147_483_647, limit: 36 })),
    chat.inputs.list(),
    ownership(backend, info),
  ])
  const pending = inputs.items.filter((item) => ["pending", "blocked", "held", "steering"].includes(item.state))
  const decisions: Decision[] = []
  let problem = pending.find((item) => item.state === "blocked")?.blocked_reason ?? null
  const active = info.active_turn_public_id
  const runs = new Set(
    turns
      .filter(
        (turn) => turn.run && (turn.id === active || ["failed", "held", "running", "pending"].includes(turn.status)),
      )
      .map((turn) => turn.run!),
  )
  // Background asks can outlive the dialog window or the active turn.
  let after: string | undefined
  do {
    const page = await backend.client.work.attention({
      workspace_public_id: backend.workspaceID,
      view: "actionable",
      after,
    })
    for (const item of page.items) if (item.conversation_public_id === id) runs.add(item.run_public_id)
    after = page.next_after ?? undefined
  } while (after)
  for (const runID of runs) {
    const run = backend.workspace.run(runID)
    const data = await run.fetch().catch((error) => {
      if (error instanceof APIError && [404, 410].includes(error.status)) return null
      throw error
    })
    if (!data || data.turn?.conversation_public_id !== id) continue
    if (!problem && (data.failure_reason || data.turn.failure_reason_key)) {
      problem = data.failure_reason ?? data.turn.failure_reason_key
    }
    if (
      !problem &&
      data.status === "needs_attention" &&
      !["approval_required", "awaiting_human"].includes(data.attention?.reason ?? "")
    )
      problem = data.attention?.reason ?? data.status
    for (const task of data.tasks.filter((t) => ["needs_approval", "awaiting_input"].includes(t.status))) {
      const detail = await run.task(task.key).fetch()
      decisions.push({
        key: task.key,
        run: runID,
        kind: task.status === "needs_approval" ? "approval" : "ask",
        tool: task.tool_name,
        siteGrant: canGrant(backend, info) ? grantSite(detail) : undefined,
        prompt: detail.prompt,
        options: detail.options,
        multi: detail.multi,
        fields: detail.fields,
        tool_input: detail.tool_input,
      })
    }
  }
  return {
    turns,
    detail: {
      title: info.title ?? "",
      runner: info.default_runner?.display_name || info.default_runner?.executor_public_id || null,
      archived: !!info.archived_at,
      owned,
      active,
      version: info.lock_version,
      usage: info.usage_summary,
      context: info.context,
    },
    pending: pending
      .filter((item) => item.origin !== "child" && item.origin !== "task_result" && item.text !== null)
      .map((item) => ({
        id: item.public_id,
        text: item.text!,
        created: Date.parse(item.created_at),
        delivery: item.delivery_mode,
        state: item.state,
        position: item.queue_position,
        version: item.lock_version,
      })),
    busy: !!active || pending.length > 0 || decisions.length > 0,
    decisions,
    problem,
  }
}

export function grantSite(detail: {
  task: { tool_name: string | null; status: string; target: { kind: string | null } | null }
  tool_input: TaskDetail["tool_input"]
}) {
  const { task } = detail
  const url = detail.tool_input?.url
  if (
    task.status !== "needs_approval" ||
    task.tool_name !== "web_fetch" ||
    task.target?.kind === "mcp" ||
    typeof url !== "string"
  )
    return
  // Keep rho's literal scheme, authority and explicit port. Never turn a credential or glob into a site grant.
  const match = /^(https?:\/\/[^/?#]+)(?:[/?#]|$)/i.exec(url)
  if (!match || /[\s\\]/.test(url) || /[@*|]/.test(match[1]) || !URL.canParse(url)) return
  return match[1]
}
// The daemon performs both approval and grant. Only offer it with independently verified
// Human standing; ordinary decisions always use the Human SDK.
export function canGrant(b: Backend, info: Conversation) {
  const level = info.access?.entries?.find((e) => e.user_public_id === b.humanID)?.level ?? info.access?.default
  return b.workspaceActive && !info.archived_at && level === "full"
}
export function resolveDecision(
  task: { approve(): Promise<unknown>; deny(): Promise<unknown>; resolve(input: ResolveTask): Promise<unknown> },
  response: Resolution,
) {
  if (response.action === "approve") return task.approve()
  if (response.action === "deny") return task.deny()
  if (response.action === "answer" && typeof response.answer === "string")
    return task.resolve({ content: response.answer })
  if (
    response.action === "answer" &&
    response.answer &&
    typeof response.answer === "object" &&
    !Array.isArray(response.answer)
  )
    return task.resolve({ answer: response.answer })
  throw new BridgeError(400, "Invalid task decision.")
}
