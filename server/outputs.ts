import { FileDiff } from "@opencode/schema/file-diff"
import { Schema } from "effect"
import { randomUUID } from "node:crypto"
import { replyContext, storedBinding } from "./reply"
import { realpath } from "node:fs/promises"
import { win32, posix } from "node:path"
import type { Conversation, Turn } from "@cybros/agent"
import { BridgeError, type Backend } from "./nexus"
import { captures, field, ownedRun, taskFiles } from "./activity"
import { outputPaths } from "./output-paths"
import type { OutputFile, Review } from "../src/nexus/inspection"

export async function rhoData<T>(res: Response): Promise<T> {
  if (!res.ok) throw new BridgeError(res.status, "rho could not provide the requested resource.")
  return res.json()
}

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
function locator(b: Backend, chat: Conversation, turn: Turn) {
  return new URLSearchParams({
    public_id: chat.public_id,
    workspace_public_id: b.workspaceID,
    turn: turn.public_id,
    variant: turn.active_variant!.public_id,
  })
}
const RecordedChange = Schema.Struct({ root: Schema.String, change: FileDiff.Info })

export async function review(b: Backend, chat: Conversation, turn: Turn) {
  if (b.native) {
    const id = turn.active_variant?.run_public_id
    if (!id || !b.localRunner || turn.reference || turn.active_variant?.details_pruned_at) return []
    const { run, data } = await ownedRun(b, chat.public_id, id)
    const reviews: Review[] = []
    for (const task of data.tasks) {
      if (
        task.status !== "completed" ||
        !["write", "edit"].includes(task.tool_name ?? "") ||
        task.target?.executor_public_id !== b.localRunner
      )
        continue
      const result = await run.task(task.key).fetch()
      const change = Schema.decodeUnknownOption(RecordedChange)(result.structured_content)
      if (change._tag !== "Some") continue
      const file = change.value.change
      reviews.push({
        runner: b.localRunner,
        root: change.value.root,
        base: task.key,
        run: id,
        files: [
          {
            state: "text",
            path: file.file,
            status: file.status,
            patch: file.patch,
            additions: file.additions,
            deletions: file.deletions,
          },
        ],
      })
    }
    return reviews
  }
  const data = await rhoData<{ reviews: Review[] }>(await b.rhoGet("/conversations/review?" + locator(b, chat, turn)))
  return data.reviews
}
export async function outputs(b: Backend, chat: Conversation, turn: Turn): Promise<OutputFile[]> {
  const variant = turn.active_variant!
  const files = new Map<string, OutputFile>()
  for (const f of variant.attachments ?? []) files.set(f.public_id, { id: f.public_id, name: f.filename })
  if (
    !b.native &&
    !turn.reference &&
    turn.kind !== "compaction_summary" &&
    turn.status === "completed" &&
    !variant.details_pruned_at &&
    (variant.run_public_id || turn.callback_sources?.length)
  ) {
    const data = await rhoData<{ published_artifacts: { public_id: string; filename: string }[] }>(
      await b.rhoGet("/conversations/artifacts?" + locator(b, chat, turn)),
    )
    for (const f of data.published_artifacts) files.set(f.public_id, { id: f.public_id, name: f.filename })
  }
  if (
    b.native &&
    variant.run_public_id &&
    !turn.reference &&
    !variant.details_pruned_at &&
    turn.status === "completed"
  ) {
    const { run, data } = await ownedRun(b, chat.public_id, variant.run_public_id)
    for (const task of data.tasks.filter(
      (item) => item.status === "completed" && item.tool_name === "file_publish" && item.target?.kind !== "mcp",
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

  // rho's bare files endpoint falls back to the local machine for an unknown host.
  // Require a confirmed conversation binding, and never turn this into a general path reader.
  const runner = info.default_runner?.executor_public_id
  if (!runner) throw new BridgeError(409, "This conversation has no bound runner.")
  const binding = b.native
    ? {
        root:
          runner === b.localRunner
            ? (await b.native.status()).directory
            : (await b.client.executors.fetch(runner)).services.runner?.environment.root,
      }
    : (await replyContext(info, b.rhoGet, (r) => storedBinding(b.workspace, info, r))).executor_contexts?.[runner]?.[
        "rho.environment"
      ]
  if (!binding || typeof binding !== "object" || Array.isArray(binding) || typeof binding.root !== "string")
    throw new BridgeError(409, "Runner file binding is unavailable.")
  const paths = /^[a-z]:[\\/]|^\\\\/i.test(binding.root) ? win32 : posix
  let root = binding.root,
    path = paths.resolve(root, id.slice(5))
  if (!b.native && b.localRunner === runner) {
    try {
      ;[root, path] = await Promise.all([realpath(root), realpath(path)])
    } catch {
      throw new BridgeError(404, "Runner file unavailable.")
    }
  }
  const rel = paths.relative(root, path)
  if (!rel || paths.isAbsolute(rel) || rel.split(paths.sep).some((part) => part.startsWith(".")))
    throw new BridgeError(403, "File is outside the conversation’s output directory.")
  // Name the exact remote runner. Without a rho follower /files/bytes would read on this machine.
  if (b.native || b.localRunner !== runner) {
    const run = await b.workspace.runs.startToolCall(
      { runner_executor_public_id: runner, tool: "files_bytes", input: { path }, timeout_ms: 30000 },
      { idempotencyKey: randomUUID() },
    )
    const capture = captures((await run.waitForToolResult({ patienceMs: 35000 })).content)[0]
    if (!capture) throw new BridgeError(404, "Runner file unavailable.")
    return { name: file.name, body: (await b.client.uploads.bytes(capture.id)).body }
  }
  if (!b.announcementPath || path === (await realpath(b.announcementPath)))
    throw new BridgeError(403, "Not a conversation output.")
  const res = await b.rhoGet("/files/bytes?" + new URLSearchParams({ path, download: "1" }))
  if (!res.ok) throw new BridgeError(res.status, "Runner file unavailable.")
  return { name: file.name, body: res.body }
}
