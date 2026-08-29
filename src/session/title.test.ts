import { describe, expect, test } from "bun:test"
import { sessionLabel, sessionTitle } from "./title"

describe("session title", () => {
  test("collapses timestamped fallback titles", () => {
    expect(sessionTitle("New session - 2026-08-29T07:00:00.000Z")).toBe("New session")
    expect(sessionTitle("Child session - 2026-08-29T07:00:00.000Z")).toBe("Child session")
    expect(sessionTitle("Generated title")).toBe("Generated title")
  })

  test("supplies local root and child labels", () => {
    expect(sessionLabel({})).toBe("New session")
    expect(sessionLabel({ parentID: "ses_parent" })).toBe("Child session")
    expect(sessionLabel({ title: "Generated title" })).toBe("Generated title")
  })
})
