import type { JsonObject, TaskDetail, TranscriptItem, Turn, TurnPage } from "@cybros/agent"
import { HISTORY_DIALOG_LIMIT } from "../constants/session"

export type Connection = {
  scope: string
  user: string
  agent: string
  workspace: string
  model: string
  runner: string | null
}
export type RecentChat = { id: string; title: string; time: { created: number; updated?: number } }
export type RecentPage = { items: RecentChat[]; next: string | null }
export type Decision = Pick<TaskDetail, "prompt" | "options" | "multi" | "fields" | "tool_input"> & {
  run: string
  key: string
  kind: "ask" | "approval"
  tool: string | null
}
export type Resolution = { action: "approve" | "deny" } | { action: "answer"; answer: JsonObject | string }
export type ChatTurn = {
  id: string
  input: string | null
  variant: string | null
  run: string | null
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
  pending: { id: string; text: string; created: number }[]
  busy: boolean
  decisions: Decision[]
  problem: string | null
}
export function projectTurn(turn: Turn): ChatTurn {
  const variant = turn.active_variant
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
    completed: completions.length ? Math.max(...completions) : undefined,
    id: turn.public_id,
    input: turn.input_public_id,
    position: turn.position,
    created: Date.parse(turn.created_at),
    variant: variant?.public_id ?? null,
    run: variant?.run_public_id ?? null,
    prompt: internal ? null : userMessage ? text : turn.kind === "direct_reply" ? (variant?.prompt_text ?? "") : null,
    text: userMessage ? "" : text,
    status: turn.status,
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
  if (!["text_delta", "stream_reset", "turn"].includes(item.type)) return
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
  if (frame.type === "stream_reset" || frame.type === "turn") delete live[key]
  if (frame.type === "text_delta") live[key] = (live[key] ?? "") + (frame.text ?? "")
}
