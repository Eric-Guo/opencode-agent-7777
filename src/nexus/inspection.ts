import type { JsonValue, RunTranscript, TaskDetail } from "@cybros/agent"

export type OutputFile = { id: string; name: string; path?: boolean }
export type Review = {
  runner: string
  root: string
  base: string
  run: string
  restorable?: boolean
  truncated?: boolean
  files: {
    path: string
    state: string
    patch?: string
    additions?: number
    deletions?: number
    status: string
  }[]
}
export type RunView = {
  status: string
  tasks: {
    key: string
    name: string
    status: string
    kind: string
    waitingOn: string[]
    branch: boolean
    terminal: boolean
    unresolved: boolean
  }[]
}
export type McpTarget = { connection: string | null; account: string | null; tool: string | null }

export type TaskView = {
  mcp?: McpTarget
  key: string
  name: string
  kind: string
  status: string
  prompt: string | null
  input: unknown
  output: string | null
  structured?: JsonValue
  error: unknown
  sealed: boolean
  captures: OutputFile[]
}
export type Rounds = RunTranscript
export type Related = { items: { id: string; name: string; busy?: boolean }[]; next: string | null }

export function mcpTarget(task: TaskDetail["task"]) {
  const target = task.target
  if (target?.kind !== "mcp") return

  return {
    connection: target.display_name || target.connection_public_id,
    account: target.account_label,
    tool: target.tool_name || task.tool_name,
  }
}
