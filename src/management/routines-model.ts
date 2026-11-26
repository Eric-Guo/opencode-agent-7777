import type { Schedule } from "@cybros/agent"

export type RoutineFilter = "all" | "time" | "event" | "check_in"
export type RoutineDoes = "act" | "check_in"

// Mirrors TimeRoutine, EventRoutine, AttentionPolicy and Observation in packages/nexus-runtime.
export type TimeRoutine = {
  kind: "time"
  public_id: string
  conversation_public_id?: string
  name: string
  what: string
  starts: Schedule["rule"]
  does: string
  wake?: string
  status: string
  enabled: boolean
  lock_version: number
  next_run_at?: string
}

export type EventRoutine = {
  kind: "event"
  public_id: string
  name: string
  what: string
  starts: { type: "event"; source_key: string; pattern?: string }
  does: string
  accept_mode?: string
  status: string
  enabled: boolean
  updated_at?: string
}

export type RoutineItem = TimeRoutine | EventRoutine

export type RoutinesOverview = {
  routines: RoutineItem[]
  attention_policy: {
    quiet_hours?: { enabled?: boolean; start?: string; end?: string; time_zone?: string } | null
    daily_proactive_limit?: number | null
  }
  observations: {
    public_id?: string
    source_key: string
    decision: string
    matched_rules?: string[]
    preview?: string
    observed_at?: string
  }[]
}

export function routineStarts(row: RoutineItem): string {
  if (row.kind === "event") {
    const source = row.starts.source_key || "*"
    return "Event on " + source + (row.starts.pattern ? ' matching "' + row.starts.pattern + '"' : "")
  }
  const starts = row.starts
  if (starts.kind === "daily") return "Daily at " + (starts.local_time || "09:00") + " (" + (starts.time_zone || "UTC") + ")"
  if (starts.kind === "interval") {
    const seconds = starts.every_seconds ?? 3600
    return seconds % 3600 === 0 ? "Every " + seconds / 3600 + "h" : "Every " + seconds + "s"
  }
  if (starts.kind === "once") return "Once at " + (starts.run_at ?? "")
  return "Scheduled"
}

export function filterRoutines(routines: RoutineItem[], filter: RoutineFilter): RoutineItem[] {
  if (filter === "all") return routines
  if (filter === "check_in") return routines.filter((row) => row.does === "check_in")
  return routines.filter((row) => row.kind === filter)
}

export function routineCounts(routines: RoutineItem[]): { active: number; checkIns: number } {
  return {
    active: routines.filter((row) => row.enabled).length,
    checkIns: routines.filter((row) => row.does === "check_in").length,
  }
}

// Mirrors the reference workbench: blank and zero fall back to 6 before clamping into 1..100.
export function clampDailyLimit(value: unknown): number {
  return Math.round(Math.min(100, Math.max(1, Number(value) || 6)))
}

// Mirrors the runtime sourceKeyPattern; "*" matches every source.
export function eventSourceError(sourceKey: string): string {
  if (sourceKey === "*") return ""
  if (/^[a-z0-9][a-z0-9:._-]{0,63}$/.test(sourceKey)) return ""
  return "Source key must be * or match [a-z0-9][a-z0-9:._-]{0,63}."
}

// datetime-local inputs carry local wall time without a zone; the wire wants an ISO instant.
export function instantInput(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19).replace(/:00$/, "")
}