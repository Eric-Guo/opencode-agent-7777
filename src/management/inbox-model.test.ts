import { expect, test } from "bun:test"
import { inboxReason, inboxRows, inboxTabs, snoozeLabel, snoozePresets, type InboxItem, type InboxPartition } from "./inbox-model"

function item(id: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    public_id: id,
    workspace_public_id: "one",
    title: id,
    is_personal_desk: false,
    has_automation: false,
    reason: "ready",
    last_activity_at: "2030-01-01T00:00:00Z",
    ...overrides,
  }
}

function partition(sections: Partial<InboxPartition["sections"]>): InboxPartition {
  const full = { needs_you: [], running: [], snoozed: [], done: [], ...sections }

  return {
    personal_desk: null,
    sections: full,
    counts: {
      needs_you: full.needs_you.length,
      running: full.running.length,
      snoozed: full.snoozed.length,
      done: full.done.length,
      skill_drafts: 0,
    },
  }
}

test("inboxRows tags every row with its bucket and flattens buckets in order for all", () => {
  const data = partition({
    needs_you: [item("a"), item("b")],
    running: [item("c")],
    snoozed: [item("d")],
    done: [item("e", { section: "done" })],
  })

  expect(inboxRows(data, "needs_you").map((row) => [row.public_id, row.section])).toEqual([
    ["a", "needs_you"],
    ["b", "needs_you"],
  ])
  expect(inboxRows(data, "all").map((row) => [row.public_id, row.section])).toEqual([
    ["a", "needs_you"],
    ["b", "needs_you"],
    ["c", "running"],
    ["d", "snoozed"],
    ["e", "done"],
  ])
  expect(inboxRows(data, "snoozed").map((row) => row.public_id)).toEqual(["d"])
  // Rows are copies: tagging a section never mutates the partition.
  expect(data.sections.needs_you[0].section).toBeUndefined()
})

test("inboxTabs totals all buckets into the all tab", () => {
  const data = partition({ needs_you: [item("a")], running: [item("b"), item("c")], done: [item("d")] })

  expect(inboxTabs(data.counts)).toEqual([
    { key: "needs_you", label: "Needs you", count: 1 },
    { key: "running", label: "Running", count: 2 },
    { key: "snoozed", label: "Snoozed", count: 0 },
    { key: "done", label: "Done", count: 1 },
    { key: "all", label: "All", count: 4 },
  ])
})

test("inboxReason maps every reason to its reference label and tone", () => {
  expect(inboxReason("awaiting_decision")).toEqual({ label: "Decision needed", tone: "warn" })
  expect(inboxReason("execution_failed")).toEqual({ label: "Execution failed", tone: "danger" })
  expect(inboxReason("working")).toEqual({ label: "Running quietly", tone: "ok" })
  expect(inboxReason("automation_enabled")).toEqual({ label: "Standing routine", tone: "ok" })
  expect(inboxReason("ready")).toEqual({ label: "Ready for review", tone: "neutral" })
})

test("snoozePresets offsets from now and lands tomorrow at 09:00 local", () => {
  const now = new Date("2030-06-01T22:30:00.000Z")
  const presets = snoozePresets(now)

  expect(presets.map((preset) => preset.label)).toEqual([
    "In 1 hour",
    "Later today (+3h)",
    "Tomorrow 09:00",
    "Someday (indefinite)",
  ])
  expect(presets[0].untilAt).toBe("2030-06-01T23:30:00.000Z")
  expect(presets[1].untilAt).toBe("2030-06-02T01:30:00.000Z")
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  expect(presets[2].untilAt).toBe(tomorrow.toISOString())
  expect(new Date(presets[2].untilAt).getHours()).toBe(9)
  expect(presets[3].untilAt).toBe("indefinite")
})

test("snoozeLabel spells out indefinite snoozes", () => {
  expect(snoozeLabel("indefinite")).toBe("Someday")
  expect(snoozeLabel("2030-06-02T01:30:00.000Z")).toBe(new Date("2030-06-02T01:30:00.000Z").toLocaleString())
})