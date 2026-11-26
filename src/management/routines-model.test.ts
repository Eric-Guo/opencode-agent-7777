import { expect, test } from "bun:test"
import {
  clampDailyLimit,
  eventSourceError,
  filterRoutines,
  instantInput,
  routineCounts,
  routineStarts,
  type EventRoutine,
  type TimeRoutine,
} from "./routines-model"

function time(overrides: Partial<TimeRoutine> = {}): TimeRoutine {
  return {
    kind: "time",
    public_id: "time-1",
    conversation_public_id: "desk",
    name: "Morning check",
    what: "Check invoices",
    starts: { kind: "daily", run_at: null, every_seconds: null, starts_at: null, local_time: "09:00", time_zone: "UTC" },
    does: "check_in",
    wake: "passive",
    status: "active",
    enabled: true,
    lock_version: 3,
    ...overrides,
  }
}

function event(overrides: Partial<EventRoutine> = {}): EventRoutine {
  return {
    kind: "event",
    public_id: "event-1",
    name: "Invoice watch",
    what: "Watch invoices",
    starts: { type: "event", source_key: "webhook:github" },
    does: "act",
    status: "observe",
    enabled: true,
    ...overrides,
  }
}

test("routineStarts summarizes event, daily, interval and once triggers", () => {
  expect(routineStarts(event())).toBe("Event on webhook:github")
  expect(routineStarts(event({ starts: { type: "event", source_key: "webhook:github", pattern: "invoice" } }))).toBe(
    'Event on webhook:github matching "invoice"',
  )
  expect(routineStarts(event({ starts: { type: "event", source_key: "" } }))).toBe("Event on *")
  expect(routineStarts(time())).toBe("Daily at 09:00 (UTC)")
  expect(
    routineStarts(
      time({ starts: { kind: "daily", run_at: null, every_seconds: null, starts_at: null, local_time: null, time_zone: null } }),
    ),
  ).toBe("Daily at 09:00 (UTC)")
  expect(
    routineStarts(
      time({
        starts: { kind: "interval", run_at: null, every_seconds: 7200, starts_at: "2030-01-01T00:00:00Z", local_time: null, time_zone: null },
      }),
    ),
  ).toBe("Every 2h")
  expect(
    routineStarts(
      time({
        starts: { kind: "interval", run_at: null, every_seconds: 90, starts_at: "2030-01-01T00:00:00Z", local_time: null, time_zone: null },
      }),
    ),
  ).toBe("Every 90s")
  expect(
    routineStarts(
      time({ starts: { kind: "once", run_at: "2030-01-01T09:00:00Z", every_seconds: null, starts_at: null, local_time: null, time_zone: null } }),
    ),
  ).toBe("Once at 2030-01-01T09:00:00Z")
})

test("filterRoutines splits by kind and silent check-ins", () => {
  const rows = [time(), event(), time({ public_id: "time-2", does: "act" })]

  expect(filterRoutines(rows, "all")).toHaveLength(3)
  expect(filterRoutines(rows, "time").map((row) => row.public_id)).toEqual(["time-1", "time-2"])
  expect(filterRoutines(rows, "event").map((row) => row.public_id)).toEqual(["event-1"])
  expect(filterRoutines(rows, "check_in").map((row) => row.public_id)).toEqual(["time-1"])
})

test("routineCounts reports enabled rows and silent check-ins", () => {
  expect(routineCounts([time(), event({ enabled: false }), time({ public_id: "time-2", does: "act" })])).toEqual({
    active: 2,
    checkIns: 1,
  })
  expect(routineCounts([])).toEqual({ active: 0, checkIns: 0 })
})

test("clampDailyLimit falls back to 6 and clamps into 1..100", () => {
  expect(clampDailyLimit("")).toBe(6)
  expect(clampDailyLimit("0")).toBe(6)
  expect(clampDailyLimit("abc")).toBe(6)
  expect(clampDailyLimit(undefined)).toBe(6)
  expect(clampDailyLimit("-4")).toBe(1)
  expect(clampDailyLimit("250")).toBe(100)
  expect(clampDailyLimit("12")).toBe(12)
  expect(clampDailyLimit("12.6")).toBe(13)
})

test("eventSourceError accepts * and runtime source keys", () => {
  expect(eventSourceError("*")).toBe("")
  expect(eventSourceError("webhook:github")).toBe("")
  expect(eventSourceError("Webhook BAD")).toContain("Source key")
  expect(eventSourceError("")).toContain("Source key")
})

test("instantInput renders an ISO instant as local datetime-local wall time", () => {
  const value = instantInput("2030-06-01T00:30:37.123Z")
  const parsed = new Date("2030-06-01T00:30:37.123Z")
  const expected = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
  expect(value).toBe(expected.replace(/:00$/, ""))
  expect(value.endsWith(":37")).toBe(true)
  expect(instantInput(null)).toBe("")
  expect(instantInput("")).toBe("")
})