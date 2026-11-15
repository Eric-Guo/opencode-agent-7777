import { Conflict, Steps } from "@cybros/agent"
import { Schema } from "effect"
import { BridgeError, readChat, type Backend } from "./nexus"

const Action = Schema.Union([
  Schema.Struct({ action: Schema.Literal("create"), runner: Schema.NonEmptyString, key: Schema.NonEmptyString }),
  Schema.Struct({
    action: Schema.Literals(["read", "stop", "approve", "realtime"]),
    run: Schema.NonEmptyString,
    task: Schema.NonEmptyString,
  }),
  Schema.Struct({
    action: Schema.Literal("answer"),
    run: Schema.NonEmptyString,
    task: Schema.NonEmptyString,
    connection_id: Schema.NonEmptyString,
    sdp: Schema.NonEmptyString,
  }),
])

export async function terminal(b: Backend, value?: unknown, after?: string) {
  if (value === undefined) {
    const page = await b.workspace.runs.list({ kind: "standalone", after, limit: 50 })

    return {
      items: page.items.flatMap((run) =>
        run.tasks
          .filter((task) => task.tool_name === "terminal")
          .map((task) => ({ run: run.public_id, task: task.key, status: task.status, created: run.created_at })),
      ),
      next: page.next_after,
    }
  }

  const command = Schema.decodeUnknownSync(Action)(value)

  if (command.action === "create") {
    if (!b.workspaceActive) throw new BridgeError(409, "Select an active workspace.")
    const runners = await b.native.runners()

    if (!runners.some((row) => row.id === command.runner)) throw new BridgeError(404, "Unknown runner.")

    const result = await b.workspace.runs.create(
      {
        steps: [
          Steps.tool({
            name: "terminal",
            key: "terminal",
            input: {},
            route: { kind: "runner", runner_executor_public_id: command.runner },
          }),
        ],
        approval_mode: "ask",
        prompt_mechanism: "raw",
        default_runner_executor_public_id: command.runner,
      },
      { idempotencyKey: command.key },
    )

    await b.workspace
      .run(result.run.public_id)
      .start()
      .catch((error: unknown) => {
        if (!(error instanceof Conflict) || error.code !== "not_startable") throw error
      })

    return { run: result.run.public_id, task: "terminal" }
  }

  const run = b.workspace.run(command.run)
  const info = await run.fetch()

  if (info.workspace_public_id !== b.workspaceID) throw new BridgeError(404, "Unknown terminal workspace.")

  if (info.turn?.conversation_public_id) await readChat(b, info.turn.conversation_public_id)

  if (!info.tasks.some((task) => task.key === command.task && task.tool_name === "terminal"))
    throw new BridgeError(404, "Unknown terminal task.")
  const task = run.task(command.task)

  if (command.action === "read") return task.fetch()

  if (command.action === "approve") return task.approve()

  if (command.action === "stop") return info.turn ? task.cancel() : run.stop(true)

  if (command.action === "realtime") return task.realtime()

  if (command.action === "answer")
    return task.answerRealtime({ connection_id: command.connection_id, sdp: command.sdp })
}
