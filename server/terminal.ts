import { Schema } from "effect"
import { listTerminalRuns } from "@opencode/nexus-runtime/terminal-runs"
import { terminalEnded } from "../src/management/terminal-stream"
import { BridgeError, canWrite, channelOwned, readChat, type Backend } from "./nexus"

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
    const page = await listTerminalRuns(b.workspace, after)
    return { items: page.items.filter((row) => !terminalEnded(row.status)), next: page.next }
  }

  const command = Schema.decodeUnknownSync(Action)(value)

  if (command.action === "create") {
    if (!b.workspaceActive) throw new BridgeError(409, "Select an active workspace.")
    const runners = await b.native.runners()

    if (!runners.some((row) => row.id === command.runner)) throw new BridgeError(404, "Unknown runner.")

    // Standalone runs use their creator's runner scope. The paired Agent owns the local runner.
    return b.native.manage({
      payload: {
        action: "application.operation",
        workspace: b.workspaceID,
        operation: { action: "terminal.open", runner: command.runner, key: command.key },
      },
    })
  }

  const run = b.workspace.run(command.run)
  const info = await run.fetch()

  if (info.workspace_public_id != null && info.workspace_public_id !== b.workspaceID)
    throw new BridgeError(404, "Unknown terminal workspace.")

  const conversation = info.turn?.conversation_public_id
    ? (await readChat(b, info.turn.conversation_public_id)).info
    : undefined

  const writable =
    b.workspaceActive && (!conversation || (canWrite(b, conversation) && !(await channelOwned(b, conversation))))

  if (!info.tasks.some((task) => task.key === command.task && task.tool_name === "terminal"))
    throw new BridgeError(404, "Unknown terminal task.")
  const task = run.task(command.task)

  if (command.action === "read") return { ...(await task.fetch()), writable }

  if (command.action === "approve") return task.approve()

  if (command.action === "stop") return info.turn?.conversation_public_id ? task.cancel() : run.stop(true)

  // Nexus binds signaling to the application owner's member credential.
  if (!writable) throw new BridgeError(403, "Write access is required to control this terminal.")

  return b.native.manage({
    payload: {
      action: "application.operation",
      workspace: b.workspaceID,
      operation: {
        action: command.action === "realtime" ? "terminal.realtime" : "terminal.answer",
        run: command.run,
        task: command.task,
        ...(command.action === "answer" ? { connection_id: command.connection_id, sdp: command.sdp } : {}),
      },
    },
  })
}
