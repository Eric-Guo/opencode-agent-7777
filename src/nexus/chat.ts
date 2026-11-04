import type { Conversation, JsonObject, TaskDetail, TranscriptItem, Turn, TurnPage } from "@cybros/agent"
import { HISTORY_DIALOG_LIMIT } from "../constants/session"

export type Connection = {
  scope: string
  user: string
  agent: string
  workspace: string
  model: string
  runner: string | null
}
export type Delivery = "queue" | "steer" | "steer_now"
export type Approval = "ask" | "rules" | "bypass"
export type Choices = { models: string[]; runners: { id: string; name: string }[]; approvals: Approval[] }
export type RecentChat = {
  working?: boolean
  attention?: boolean
  id: string
  title: string
  time: { created: number; updated?: number }
}
export type RecentPage = { items: RecentChat[]; next: string | null }
export type Decision = Pick<TaskDetail, "prompt" | "options" | "multi" | "fields" | "tool_input"> & {
  run: string
  key: string
  kind: "ask" | "approval"
  siteGrant?: string
  tool: string | null
}
export type Resolution = { action: "approve" | "deny" | "site" } | { action: "answer"; answer: JsonObject | string }
export type ChatTurn = {
  id: string
  input: string | null
  variant: string | null
  run: string | null
  receipt?: string
  kind?: "background" | "summary" | "reference"
  pruned?: boolean
  review?: boolean
  files?: boolean
  position: number
  created: number
  completed?: number
  model?: { id: string; providerID: string }
  prompt: string | null
  text: string
  status: string
}
export type Snapshot = {
  turns: ChatTurn[]
  detail?: {
    title: string
    runner: string | null
    archived: boolean
    owned: boolean
    active: string | null
    version: number
    usage: Conversation["usage_summary"]
    context: Conversation["context"]
  }
  pending: {
    id: string
    text: string
    created: number
    delivery?: string
    state?: string
    position?: number
    version?: number
  }[]
  busy: boolean
  decisions: Decision[]
  problem: string | null
}
export function projectTurn(turn: Turn): ChatTurn {
  // A regeneration may already be running while the last completed variant is still marked active.
  const candidate = turn.running_variant
  const variant = candidate ?? turn.active_variant
  const status = candidate?.status ?? turn.status
  const terminal = ["completed", "failed", "canceled", "cancelled", "timed_out", "skipped", "stopped"].includes(status)
  const answer = !turn.reference && turn.kind !== "compaction_summary" && turn.role === "assistant"
  const recorded = !!variant && variant.public_id === turn.active_variant?.public_id
  const text = variant?.content ?? variant?.content_preview ?? ""
  const userMessage = turn.kind === "message" && turn.role === "user"
  const internal =
    turn.reference ||
    !!turn.sender_conversation_public_id ||
    ["child", "task_result", "agent"].includes(turn.origin ?? "")
  const completions = (variant?.rounds ?? []).flatMap((round) =>
    round && typeof round === "object" && !Array.isArray(round) && typeof round.completed_at === "string"
      ? [Date.parse(round.completed_at)].filter(Number.isFinite)
      : [],
  )
  return {
    model: variant?.model?.model_ref
      ? { id: variant.model.model_ref, providerID: variant.model.provider_id ?? "nexus" }
      : undefined,
    kind: turn.reference
      ? "reference"
      : turn.kind === "compaction_summary"
        ? "summary"
        : turn.kind === "message" && ["child", "task_result"].includes(turn.origin ?? "")
          ? "background"
          : undefined,
    receipt:
      turn.kind === "direct_reply" && ["child", "task_result"].includes(turn.origin ?? "")
        ? (variant?.prompt_text ?? undefined)
        : undefined,
    pruned: !!variant?.details_pruned_at,
    review:
      recorded && answer && terminal && variant.runner_effects?.status === "touched" && !variant.details_pruned_at,
    files: recorded && (!!variant.attachments?.length || (answer && terminal)),
    completed: completions.length ? Math.max(...completions) : undefined,
    id: turn.public_id,
    input: turn.input_public_id,
    position: turn.position,
    created: Date.parse(turn.created_at),
    variant: variant?.public_id ?? null,
    run: variant?.run_public_id ?? null,
    prompt: internal ? null : userMessage ? text : turn.kind === "direct_reply" ? (variant?.prompt_text ?? "") : null,
    text: userMessage && !internal ? "" : text,
    status,
  }
}

export function latestDialogs(turns: ChatTurn[]) {
  const first = turns.filter((turn) => turn.prompt !== null).at(-HISTORY_DIALOG_LIMIT)
  return first ? turns.slice(turns.indexOf(first)) : turns
}

export async function loadTurns(page: (before?: number) => Promise<TurnPage>) {
  const rows = new Map<string, ChatTurn>()
  let before: number | undefined
  do {
    const result = await page(before)
    for (const turn of result.items) rows.set(turn.public_id, projectTurn(turn))
    if (
      !result.items.length ||
      result.before_position === null ||
      (before !== undefined && result.before_position >= before)
    )
      break
    before = result.before_position
  } while (Array.from(rows.values()).filter((row) => row.prompt !== null).length < HISTORY_DIALOG_LIMIT)
  return latestDialogs(Array.from(rows.values()).sort((a, b) => a.position - b.position))
}

export type Frame = Pick<TranscriptItem, "type" | "turn_public_id" | "variant_public_id"> & {
  text?: string
  turn?: ChatTurn
}
export function projectFrame(item: TranscriptItem): Frame | undefined {
  if (!["text_delta", "reasoning_delta", "stream_reset", "turn"].includes(item.type)) return
  return {
    type: item.type,
    turn_public_id: item.turn_public_id,
    variant_public_id: item.variant_public_id,
    text: typeof item.payload.text === "string" ? item.payload.text : undefined,
    turn: item.turn ? projectTurn(item.turn) : undefined,
  }
}

export function liveKey(turn: string, variant: string) {
  return turn + "/" + variant
}
export function updateLive(live: Record<string, string>, frame: Frame) {
  if (!frame.turn_public_id || !frame.variant_public_id) return
  const key = liveKey(frame.turn_public_id, frame.variant_public_id)
  if (frame.type === "stream_reset" || frame.type === "turn") {
    delete live[key]
    delete live[key + "/reasoning"]
  }
  if (frame.type === "reasoning_delta") live[key + "/reasoning"] = (live[key + "/reasoning"] ?? "") + (frame.text ?? "")
  if (frame.type === "text_delta") live[key] = (live[key] ?? "") + (frame.text ?? "")
}
