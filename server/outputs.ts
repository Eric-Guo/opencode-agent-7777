import { FileDiff } from "@opencode/schema/file-diff"
import { Schema } from "effect"
import { randomUUID } from "node:crypto"
import type { Conversation, Turn } from "@cybros/agent"
import { BridgeError, type Backend } from "./nexus"
import { captures, field, ownedRun, taskFiles } from "./activity"
import { outputPaths } from "./output-paths"
import type { OutputFile, Review } from "../src/nexus/inspection"

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
const Checkpoint = Schema.Struct({ hash: Schema.NonEmptyString, store: Schema.String })
const RecordedTree = Schema.Struct({
  root: Schema.String,
  changes: Schema.Array(FileDiff.Info),
  truncated: Schema.Boolean,
})
const RecordedChange = Schema.Struct({ root: Schema.String, change: FileDiff.Info })

const CheckpointChanges = Schema.Struct({
  root: Schema.String,
  base: Schema.NonEmptyString,
  captured_at: Schema.DateFromString,
  truncated: Schema.Boolean,
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      state: Schema.Literals(["text", "binary", "too_large", "omitted"]),
      status: Schema.Literals(["A", "D", "M", "T"]),
      patch: Schema.optionalKey(Schema.String),
      additions: Schema.optionalKey(FileDiff.Info.fields.additions),
      deletions: Schema.optionalKey(FileDiff.Info.fields.deletions),
    }),
  ),
})
const CHECKPOINT_STATUS = { A: "added", D: "deleted", M: "modified", T: "modified" } as const
const STEP_REVIEW_TOOLS = new Set(["write", "edit", "bash"])

export async function review(b: Backend, chat: Conversation, turn: Turn) {
  const id = turn.active_variant?.run_public_id
  if (!id || !b.localRunner || turn.reference || turn.active_variant?.details_pruned_at) return []
  const { run, data } = await ownedRun(b, chat.public_id, id)
  const reviews: Review[] = []
  const snapshots = new Map<string, typeof CheckpointChanges.Type>()
  for (const task of data.tasks) {
    if (task.status !== "completed" || task.target?.kind === "mcp" || task.target?.executor_public_id !== b.localRunner)
      continue
    const result = await run.task(task.key).fetch()
    // The runner records cumulative changes against this run's baseline, including after terminal reads and closes.
    const snapshot = Schema.decodeUnknownOption(CheckpointChanges)(result.metadata?.["rho.changes"])
    if (snapshot._tag === "Some") {
      const current = snapshot.value
      const key = JSON.stringify([current.root, current.base])
      const previous = snapshots.get(key)
      if (!previous || previous.captured_at <= current.captured_at) snapshots.set(key, current)
    }
    if (!STEP_REVIEW_TOOLS.has(task.tool_name ?? "")) continue
    const change = Schema.decodeUnknownOption(RecordedChange)(result.structured_content)
    const tree = Schema.decodeUnknownOption(RecordedTree)(result.structured_content)
    const checkpoint = Schema.decodeUnknownOption(Checkpoint)(result.metadata?.checkpoint)
    const record =
      change._tag === "Some"
        ? { root: change.value.root, files: [change.value.change], truncated: false }
        : tree._tag === "Some"
          ? { root: tree.value.root, files: tree.value.changes, truncated: tree.value.truncated }
          : undefined
    if (!record || !record.files.length) continue
    reviews.push({
      runner: b.localRunner,
      root: record.root,
      base: task.key,
      run: id,
      truncated: record.truncated,
      restorable: checkpoint._tag === "Some",
      files: record.files.map((file) => ({
        state: "text",
        path: file.file,
        status: file.status,
        patch: file.patch,
        additions: file.additions,
        deletions: file.deletions,
      })),
    })
  }
  // Keep step-specific patches and restore targets. Add any distinct patch captured by the checkpoint.
  const stepFiles = new Map(
    reviews.flatMap((step) => step.files.map((file) => [JSON.stringify([step.root, file.path]), file] as const)),
  )
  for (const snapshot of snapshots.values()) {
    const files = snapshot.files.flatMap((file) => {
      const status = CHECKPOINT_STATUS[file.status]
      const step = stepFiles.get(JSON.stringify([snapshot.root, file.path]))
      if (step && file.state === "text" && step.status === status && step.patch === file.patch) return []
      return [{ ...file, status }]
    })
    if (files.length || snapshot.truncated)
      reviews.push({
        source: "checkpoint",
        runner: b.localRunner,
        run: id,
        base: snapshot.base,
        root: snapshot.root,
        truncated: snapshot.truncated,
        files,
      })
  }
  return reviews
}

export async function restoreReview(b: Backend, chat: Conversation, turn: Turn, taskKey: string, receipt: string) {
  const id = turn.active_variant?.run_public_id
  if (!id || turn.reference || !b.localRunner || turn.status !== "completed")
    throw new BridgeError(409, "This answer has no restorable checkpoint.")
  const { run } = await ownedRun(b, chat.public_id, id)
  const detail = await run.task(taskKey).fetch()
  if (
    detail.task.status !== "completed" ||
    detail.task.target?.executor_public_id !== b.localRunner ||
    !STEP_REVIEW_TOOLS.has(detail.task.tool_name ?? "")
  )
    throw new BridgeError(409, "This change has no local checkpoint.")
  const checkpoint = Schema.decodeUnknownOption(Checkpoint)(detail.metadata?.checkpoint)
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
  if (variant.run_public_id && !turn.reference && !variant.details_pruned_at && turn.status === "completed") {
    const { run, data } = await ownedRun(b, chat.public_id, variant.run_public_id)
    for (const task of data.tasks.filter(
      (item) =>
        item.status === "completed" &&
        item.target?.kind !== "mcp" &&
        (item.tool_name === "file_publish" ||
          (item.target?.executor_public_id === b.localRunner &&
            (item.tool_name === "browser_screenshot" ||
              item.tool_name === "web_fetch" ||
              item.tool_name?.startsWith("mcp__")))),
    )) {
      const detail = await run.task(task.key).fetch()
      for (const file of captures(detail.content)) files.set(file.id, file)
    }
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
  const id = field(q.get("file"), "file")
  let files: OutputFile[]
  if (q.has("key")) {
    const { run } = await ownedRun(b, info.public_id, field(q.get("run"), "run"))
    files = taskFiles(await run.task(field(q.get("key"), "task")).fetch(), info.default_runner?.executor_public_id)
  } else files = await outputs(b, info, await outputTurn(b, info, q))
  const file = files.find((f) => f.id === id)
  if (!file) throw new BridgeError(404, "Unknown answer file.")
  if (!file.path) return { name: file.name, body: (await b.client.uploads.bytes(id)).body }

  const runner = info.default_runner?.executor_public_id
  if (!runner) throw new BridgeError(409, "This conversation has no bound runner.")
  const result = await b.native.operator({
    workspace: b.workspaceID,
    conversation: info.public_id,
    runner,
    receipt: randomUUID(),
    operation: { tool: "files_bytes", path: id.slice(5) },
  })
  if (!result.upload) throw new BridgeError(404, "Runner file unavailable.")
  return { name: file.name, body: (await b.client.uploads.bytes(result.upload)).body }
}
