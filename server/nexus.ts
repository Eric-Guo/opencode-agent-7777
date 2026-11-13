import { nexusService, type ServiceConnection } from "./native"
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
  native: ReturnType<typeof nexusService>
  humanID: string
  workspaceActive: boolean
  localRunner: string | null
  fallbackModels: string[]
  realtime: () => RealtimeClient
}
export async function discoverNative(
  config?: { origin: string; connection: () => Promise<ServiceConnection> },
  token?: string,
) {
  if (!config) throw new BridgeError(503, "Configure a Nexus origin and pair the OpenCode service.")
  if (!token) throw new BridgeError(503, "Save a Human member token for this Nexus origin.")
  const service = nexusService(await config.connection())
  const state = await service.status()
  if (state.origin !== config.origin || state.state !== "ready" || !state.identity)
    throw new BridgeError(503, state.error ?? "Pair OpenCode with this Nexus origin in Settings.")
  const identity = state.identity
  return connectMember(state.origin, token, {
    workspaceID: identity.workspace,
    agentID: identity.agent,
    model: state.model,
    agent: identity.name,
    runner: identity.runner,
    localRunner: identity.runner,
    fallbackModels: [],
    native: service,
  })
}

async function connectMember(
  baseURL: string,
  token: string,
  runtime: Pick<Backend, "agentID" | "workspaceID" | "localRunner" | "fallbackModels" | "native"> &
    Pick<Connection, "model" | "agent" | "runner">,
): Promise<Backend> {
  const { workspaceID, agentID, model } = runtime
  const options = { baseURL, credential: token }
  const client = new Client(options)
  const profile = await client.profile.fetch()
  if (profile.member.kind !== "human")
    throw new BridgeError(403, "Use your Human member-plane token from Nexus personal token settings.")
  const workspace = client.workspace(workspaceID)
  const workspaceInfo = await workspace.fetch()
  const connection: Connection = {
    scope: JSON.stringify([options.baseURL, profile.member.public_id, workspaceID, agentID]),
    user: profile.member.display_name || profile.member.handle,
    agent: runtime.agent,
    workspace: workspaceInfo.name,
    model,
    runner: runtime.runner,
  }
  return {
    client,
    ...runtime,
    humanID: profile.member.public_id,
    workspaceActive: ["active", "restoring"].includes(workspaceInfo.state),
    workspace,
    connection,
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
    throw new BridgeError(404, "This conversation is outside the selected Nexus workspace.")
  return { chat, info }
}
export function ownership(info: Conversation) {
  return info.metadata["opencode.surface"] !== "desktop"
}
export async function snapshot(backend: Backend, id: string): Promise<Snapshot> {
  const { chat, info } = await readChat(backend, id)
  // Unbounded turns.list starts at the oldest turn. A before-position window reads newest first.
  const [turns, inputs, owned] = await Promise.all([
    loadTurns((before_position) => chat.turns.list({ before_position: before_position ?? 2_147_483_647, limit: 36 })),
    chat.inputs.list(),
    ownership(info),
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
        siteGrant:
          !owned && detail.task.target?.executor_public_id === backend.localRunner && canWrite(backend, info)
            ? grantSite(detail)
            : undefined,
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
  // Keep the literal scheme, authority and explicit port. Never turn a credential or glob into a site grant.
  const match = /^(https?:\/\/[^/?#]+)(?:[/?#]|$)/i.exec(url)
  if (!match || /[\s\\]/.test(url) || /[@*|]/.test(match[1]) || !URL.canParse(url)) return
  return match[1]
}
// Check the Human’s standing before using the agent credential for conversation policy or a site grant.
export function canWrite(b: Backend, info: Conversation) {
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
