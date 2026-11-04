import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { APIError, Client, type Conversation, type ResolveTask } from "@cybros/agent"
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
  rhoGet: (path: string) => Promise<Response>
  localRunner: string | null
  agentExecutor: string | null
  realtime: () => RealtimeClient
}
export async function discover(home: string, token?: string): Promise<Backend> {
  if (!token) throw new BridgeError(503, "Set NEXUS_MEMBER_TOKEN in .env.local to your Nexus personal member token.")
  const announcement = JSON.parse(
    await readFile(join(home || join(homedir(), ".rho"), "tmp", "announcement.json"), "utf8"),
  )
  const endpoint = new URL(announcement.endpoint)
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
    endpoint.protocol !== "http:" ||
    announcement.state !== "active"
  )
    throw new BridgeError(503, "The local rho daemon is unavailable.")
  const rhoGet = (path: string) =>
    fetch(new URL(path, endpoint), {
      headers: { Authorization: "Bearer " + announcement.bearer },
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
  await workspace.fetch()
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
    workspace,
    workspaceID: workspaceID as string,
    agentID: agentID as string,
    connection,
    rhoGet,
    localRunner: rho.identity.runner_executor_public_id ?? null,
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
  if (info.answering_user_public_id !== backend.agentID || info.side || info.archived_at)
    throw new BridgeError(404, "This conversation is outside the selected rho workspace.")
  return { chat, info }
}
export async function snapshot(backend: Backend, id: string): Promise<Snapshot> {
  const { chat, info } = await readChat(backend, id)
  // Unbounded turns.list starts at the oldest turn. A before-position window reads newest first.
  const [turns, inputs] = await Promise.all([
    loadTurns((before_position) => chat.turns.list({ before_position: before_position ?? 2_147_483_647, limit: 36 })),
    chat.inputs.list(),
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
    pending: pending
      .filter((item) => item.origin !== "child" && item.origin !== "task_result" && item.text !== null)
      .map((item) => ({ id: item.public_id, text: item.text!, created: Date.parse(item.created_at) })),
    busy: !!active || pending.length > 0 || decisions.length > 0,
    decisions,
    problem,
  }
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
