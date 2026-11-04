import type { Conversation, JsonValue, Run, TaskDetail } from "@cybros/agent"
import { outputPaths } from "./output-paths"
import { loadTurns } from "../src/nexus/chat"
import { BridgeError, type Backend } from "./nexus"

export function field(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw new BridgeError(400, "Invalid " + name)
  return value
}

export async function ownedRun(
  b: Backend,
  id: string,
  rid: string,
): Promise<{ run: ReturnType<Backend["workspace"]["run"]>; data: Run }> {
  const run = b.workspace.run(field(rid, "run"))
  const data = await run.fetch()
  if (
    data.turn?.conversation_public_id !== id ||
    (data.workspace_public_id != null && data.workspace_public_id !== b.workspaceID)
  )
    throw new BridgeError(404, "Unknown conversation run.")
  return { run, data }
}

export function captures(content: JsonValue) {
  return (Array.isArray(content) ? content : []).flatMap((e) => {
    if (
      !e ||
      typeof e !== "object" ||
      Array.isArray(e) ||
      e.type !== "resource_link" ||
      typeof e.uri !== "string" ||
      !/^nexus:\/\/uploads\/[\w-]+$/.test(e.uri)
    )
      return []
    return [{ id: e.uri.slice("nexus://uploads/".length), name: String(e.name || "capture") }]
  })
}

export function taskFiles(detail: TaskDetail, runner: string | null | undefined) {
  const uploads = captures(detail.content)
  const names = new Set(uploads.map((file) => file.name))
  const source = detail.task.target
  const paths =
    runner && (source?.kind !== "runner" || source.executor_public_id === runner)
      ? outputPaths(detail.output ?? detail.output_preview ?? "").filter((f) => !names.has(f.name))
      : []
  return [...uploads, ...paths]
}
export function taskView(detail: TaskDetail, runner: string | null | undefined) {
  return {
    key: detail.task.key,
    kind: detail.task.kind,
    status: detail.task.status,
    name: detail.task.tool_alias || detail.task.tool_name || detail.task.key,
    prompt: detail.prompt,
    input: detail.tool_input,
    output: detail.output ?? detail.output_preview,
    error: detail.task.error,
    captures: taskFiles(detail, runner),
    sealed: detail.task.kind === "model_task",
  }
}

export async function activityRead(b: Backend, info: Conversation, action: string, q: URLSearchParams) {
  const chat = b.workspace.conversation(info.public_id)
  if (action === "work") {
    const items: { id: string; status: string }[] = []
    let after: string | undefined
    do {
      const page = await b.workspace.runs.list({
        kind: "conversation",
        status: ["running", "paused", "needs_attention"],
        after,
        limit: 100,
      })
      for (const run of page.items)
        if (run.turn?.conversation_public_id === info.public_id) items.push({ id: run.public_id, status: run.status })
      after = page.next_after ?? undefined
    } while (after)
    return items
  }
  if (action === "child") {
    const child = b.workspace.conversation(field(q.get("id"), "child"))
    if ((await child.fetch()).parent?.public_id !== info.public_id) throw new BridgeError(404, "Unknown child.")
    return loadTurns((before_position) =>
      child.turns.list({ before_position: before_position ?? 2147483647, limit: 36 }),
    )
  }
  if (action === "children" || action === "links") {
    const after = q.get("after") || undefined
    if (action === "children") {
      const page = await chat.children({ after })
      return {
        items: page.items.map((c) => ({
          id: c.public_id,
          name: c.parent?.label || c.title || c.public_id,
          busy: !!c.active_turn_public_id,
        })),
        next: page.next_after,
      }
    }
    const page = await chat.links.list({ state: "active", after })
    return {
      items: page.items.map((l) => ({ id: l.public_id, name: l.peer.conversation_public_id })),
      next: page.next_after,
    }
  }
  const { run, data } = await ownedRun(b, info.public_id, field(q.get("run"), "run"))
  if (action === "run") {
    const graph = await run.graph()
    const branches = new Set(graph.nodes.filter((node) => node.mainline !== true).map((node) => node.key))
    return {
      status: data.status,
      tasks: data.tasks.map((t) => ({
        key: t.key,
        name: t.tool_alias || t.tool_name || t.key,
        status: t.status,
        unresolved:
          ["failed", "timed_out", "uncertain"].includes(t.status) &&
          !t.failure_resolution &&
          (t.on_failure !== "absorb" || t.error?.key === "conversation_cost_limit_reached"),
        kind: t.kind,
        waitingOn: t.waiting_on ?? [],
        branch: branches.has(t.key),
        terminal: ["failed", "timed_out", "uncertain", "skipped", "completed", "canceled"].includes(t.status),
      })),
    }
  }
  if (action === "rounds") return run.transcript({ before: q.get("before") || undefined, limit: 20 })
  const task = run.task(field(q.get("key"), "task"))
  if (action === "task") return taskView(await task.fetch(), info.default_runner?.executor_public_id)
  if (action === "request") return task.request()
  throw new BridgeError(404, "Unknown activity.")
}

export async function execution(b: Backend, info: Conversation, body: Record<string, unknown>) {
  if (body.action === "child-stop") {
    const child = b.workspace.conversation(field(body.id, "child"))
    if ((await child.fetch()).parent?.public_id !== info.public_id) throw new BridgeError(404, "Unknown child.")
    return child.cancel()
  }
  if (body.action === "link-close") return b.workspace.conversation(info.public_id).links.close(field(body.id, "link"))
  const { run } = await ownedRun(b, info.public_id, field(body.run, "run"))
  if (body.action === "pause") return run.pause()
  if (body.action === "resume") return run.resume()
  const task = run.task(field(body.key, "task"))
  if (body.action === "retry") return task.retry()
  if (body.action === "abandon") return task.abandon()
  if (body.action === "cancel") return task.cancel()
  throw new BridgeError(400, "Unknown execution action.")
}
