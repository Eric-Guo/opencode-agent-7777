export type InboxBucket = "needs_you" | "running" | "snoozed" | "done"
export type InboxFilter = InboxBucket | "all"

// Mirrors InboxItem and InboxPartition in packages/nexus-runtime/src/inbox.ts.
export type InboxItem = {
  public_id: string
  workspace_public_id: string
  title: string
  is_personal_desk: boolean
  has_automation: boolean
  run_status?: string
  reason: "awaiting_decision" | "execution_failed" | "working" | "automation_enabled" | "ready"
  last_activity_at: string
  snoozed_until?: string
  read_at?: string
  section?: InboxBucket
}

export type InboxPartition = {
  personal_desk: InboxItem | null
  sections: Record<InboxBucket, InboxItem[]>
  counts: Record<InboxBucket, number> & { skill_drafts: number }
}

export const inboxBuckets = ["needs_you", "running", "snoozed", "done"] as const

export function inboxRows(partition: InboxPartition, filter: InboxFilter): InboxItem[] {
  if (filter !== "all") return (partition.sections[filter] ?? []).map((row) => ({ ...row, section: filter }))
  return inboxBuckets.flatMap((bucket) => (partition.sections[bucket] ?? []).map((row) => ({ ...row, section: bucket })))
}

export function inboxTabs(counts: InboxPartition["counts"]): { key: InboxFilter; label: string; count: number }[] {
  return [
    { key: "needs_you", label: "Needs you", count: counts.needs_you },
    { key: "running", label: "Running", count: counts.running },
    { key: "snoozed", label: "Snoozed", count: counts.snoozed },
    { key: "done", label: "Done", count: counts.done },
    { key: "all", label: "All", count: counts.needs_you + counts.running + counts.snoozed + counts.done },
  ]
}

export function inboxReason(reason: InboxItem["reason"]): { label: string; tone: "warn" | "danger" | "ok" | "neutral" } {
  switch (reason) {
    case "awaiting_decision":
      return { label: "Decision needed", tone: "warn" }
    case "execution_failed":
      return { label: "Execution failed", tone: "danger" }
    case "working":
      return { label: "Running quietly", tone: "ok" }
    case "automation_enabled":
      return { label: "Standing routine", tone: "ok" }
    case "ready":
      return { label: "Ready for review", tone: "neutral" }
  }
}

export function snoozeLabel(untilAt: string) {
  if (untilAt === "indefinite") return "Someday"
  return new Date(untilAt).toLocaleString()
}

// Snooze targets are computed at click time so a reopened menu never posts a stale instant.
export function snoozePresets(now: Date): { label: string; untilAt: string }[] {
  const inHours = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)

  return [
    { label: "In 1 hour", untilAt: inHours(1) },
    { label: "Later today (+3h)", untilAt: inHours(3) },
    { label: "Tomorrow 09:00", untilAt: tomorrow.toISOString() },
    { label: "Someday (indefinite)", untilAt: "indefinite" },
  ]
}