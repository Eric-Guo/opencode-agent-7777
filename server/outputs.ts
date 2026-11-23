import {
  checkpointTools,
  publishedArtifacts,
  recordedChanges,
  RestoreCheckpoint,
} from "@opencode/nexus-runtime/experimental/history"
import { Schema } from "effect"
import { randomUUID } from "node:crypto"
import type { Conversation, Turn } from "@cybros/agent"
import { BridgeError, type Backend } from "./nexus"
import { field, ownedRun, taskFiles } from "./activity"
import { hasAnswerImage, outputPaths } from "./output-paths"
import type { OutputFile } from "../src/nexus/inspection"

export async function outputTurn(b: Backend, chat: Conversation, q: URLSearchParams) {
  const turn = await b.workspace.conversation(chat.public_id).turns.fetch(field(q.get("turn"), "turn"))
  if (
    !turn.active_variant ||
    turn.active_variant.public_id !== q.get("variant") ||
    (turn.running_variant && turn.running_variant.public_id !== q.get("variant"))
  )
    throw new BridgeError(409, "The displayed answer has changed.")
  return turn
}

export async function review(b: Backend, chat: Conversation, turn: Turn) {
  const variant = turn.active_variant
  if (
    !variant?.run_public_id ||
    variant.details_pruned_at ||
    variant.runner_effects?.status !== "touched" ||
    turn.reference ||
    turn.kind === "compaction_summary" ||
    !["completed", "failed", "canceled", "timed_out"].includes(turn.status)
  )
    return []

  const { run, data } = await ownedRun(b, chat.public_id, variant.run_public_id, turn)
  return recordedChanges(run, data, variant.runner_effects, turn.inherited ? null : b.localRunner)
}

export async function restoreReview(b: Backend, chat: Conversation, turn: Turn, taskKey: string, receipt: string) {
  const id = turn.active_variant?.run_public_id
  if (!id || turn.reference || turn.inherited || !b.localRunner || turn.status !== "completed")
    throw new BridgeError(409, "This answer has no restorable checkpoint.")
  const { run } = await ownedRun(b, chat.public_id, id)
  const detail = await run.task(taskKey).fetch()
  if (
    detail.task.status !== "completed" ||
    detail.task.target?.kind === "mcp" ||
    detail.task.target?.executor_public_id !== b.localRunner ||
    !checkpointTools.has(detail.task.tool_name ?? "")
  )
    throw new BridgeError(409, "This change has no local checkpoint.")
  const checkpoint = Schema.decodeUnknownOption(RestoreCheckpoint)(detail.metadata?.checkpoint)
  if (checkpoint._tag !== "Some") throw new BridgeError(409, "No retained checkpoint.")
  await b.native.operator({
    workspace: b.workspaceID,
    conversation: chat.public_id,
    runner: b.localRunner,
    receipt,
    operation: { tool: "checkpoint_restore", run: id, task: taskKey },
  })
}
export async function outputs(b: Backend, chat: Conversation, turn: Turn): Promise<OutputFile[]> {
  const variant = turn.active_variant!
  const files = new Map<string, OutputFile>()
  for (const f of variant.attachments ?? []) files.set(f.public_id, { id: f.public_id, name: f.filename })
  if (
    !turn.reference &&
    turn.kind !== "compaction_summary" &&
    variant.status === "completed" &&
    !variant.details_pruned_at &&
    (variant.run_public_id || turn.callback_sources.length)
  ) {
    const run = variant.run_public_id
      ? (await ownedRun(b, chat.public_id, variant.run_public_id, turn)).data
      : undefined
    const published = await publishedArtifacts(b.client, b.workspaceID, {
      run,
      results: turn.callback_sources.map((source) => source.result),
    })
    for (const file of published) files.set(file.public_id, { id: file.public_id, name: file.filename })
  }
  const names = new Set([...files.values()].map((f) => f.name))
  if (turn.role === "assistant" && !turn.reference && chat.default_runner) {
    for (const file of outputPaths(variant.content ?? variant.content_preview ?? "")) {
      if (!names.has(file.name)) files.set(file.id, file)
    }
  }
  return [...files.values()]
}

export async function fileBytes(b: Backend, info: Conversation, q: URLSearchParams) {
  if (q.has("image")) {
    const path = field(q.get("image"), "image")
    const turn = await outputTurn(b, info, q)
    const variant = turn.active_variant!
    if (
      turn.role !== "assistant" ||
      turn.reference ||
      turn.status !== "completed" ||
      !hasAnswerImage(variant.content ?? variant.content_preview ?? "", path)
    )
      throw new BridgeError(404, "Unknown answer image.")
    return runnerFileBytes(b, info, path, path.split("/").at(-1)!)
  }
  const id = field(q.get("file"), "file")
  let files: OutputFile[]
  if (q.has("key")) {
    const { run } = await ownedRun(b, info.public_id, field(q.get("run"), "run"))
    files = taskFiles(await run.task(field(q.get("key"), "task")).fetch(), info.default_runner?.executor_public_id)
  } else files = await outputs(b, info, await outputTurn(b, info, q))
  const file = files.find((f) => f.id === id)
  if (!file) throw new BridgeError(404, "Unknown answer file.")
  if (!file.path) return { name: file.name, body: (await b.client.uploads.bytes(id)).body }
  return runnerFileBytes(b, info, id.slice(5), file.name)
}

async function runnerFileBytes(b: Backend, info: Conversation, path: string, name: string) {
  const runner = info.default_runner?.executor_public_id
  if (!runner) throw new BridgeError(409, "This conversation has no bound runner.")
  const result = await b.native.operator({
    workspace: b.workspaceID,
    conversation: info.public_id,
    runner,
    receipt: randomUUID(),
    operation: { tool: "files_bytes", path },
  })
  if (!result.upload) throw new BridgeError(404, "Runner file unavailable.")
  return { name, body: (await b.client.uploads.bytes(result.upload)).body }
}
