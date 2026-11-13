import { FileDiff } from "@opencode/schema/file-diff"
import { Schema } from "effect"
import { randomUUID } from "node:crypto"
import { win32, posix } from "node:path"
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

export async function review(b: Backend, chat: Conversation, turn: Turn) {
  const id = turn.active_variant?.run_public_id
  if (!id || !b.localRunner || turn.reference || turn.active_variant?.details_pruned_at) return []
  const { run, data } = await ownedRun(b, chat.public_id, id)
  const reviews: Review[] = []
  for (const task of data.tasks) {
    if (
      task.status !== "completed" ||
      !["write", "edit", "bash"].includes(task.tool_name ?? "") ||
      task.target?.executor_public_id !== b.localRunner
    )
      continue
    const result = await run.task(task.key).fetch()
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
    !["bash", "write", "edit"].includes(detail.task.tool_name ?? "")
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
  const root =
    runner === b.localRunner
      ? (await b.native.status()).directory
      : (await b.client.executors.fetch(runner)).services.runner?.environment.root
  if (typeof root !== "string" || !root) throw new BridgeError(409, "Runner file binding is unavailable.")
  const paths = /^[a-z]:[\\/]|^\\\\/i.test(root) ? win32 : posix
  const path = paths.resolve(root, id.slice(5))
  const rel = paths.relative(root, path)
  if (!rel || paths.isAbsolute(rel) || rel.split(paths.sep).some((part) => part.startsWith(".")))
    throw new BridgeError(403, "File is outside the conversation’s output directory.")
  const result = await b.native.operator({
    workspace: b.workspaceID,
    conversation: info.public_id,
    runner,
    receipt: randomUUID(),
    operation: { tool: "files_bytes", path },
  })
  if (!result.upload) throw new BridgeError(404, "Runner file unavailable.")
  return { name: file.name, body: (await b.client.uploads.bytes(result.upload)).body }
}
