import type { RunTranscript } from "@cybros/agent"

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
export type TaskView = {
  key: string
  name: string
  kind: string
  status: string
  prompt: string | null
  input: unknown
  output: string | null
  error: unknown
  sealed: boolean
  captures: OutputFile[]
}
export type Rounds = RunTranscript
export type Related = { items: { id: string; name: string; busy?: boolean }[]; next: string | null }
