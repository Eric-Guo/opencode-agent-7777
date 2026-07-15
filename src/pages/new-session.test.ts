import { describe, expect, test } from "bun:test"
import { canReuseCurrentSession } from "./new-session"

const blankSession = {
  hasSession: true,
  messagesLoading: false,
  messageCount: 0,
  prompt: "",
  attachmentCount: 0,
}

describe("new session", () => {
  test("reuses the current blank session", () => {
    expect(canReuseCurrentSession(blankSession)).toBe(true)
    expect(canReuseCurrentSession({ ...blankSession, prompt: "   " })).toBe(true)
  })

  test("creates a session when the current one has user content", () => {
    expect(canReuseCurrentSession({ ...blankSession, prompt: "Explain this code" })).toBe(false)
    expect(canReuseCurrentSession({ ...blankSession, attachmentCount: 1 })).toBe(false)
    expect(canReuseCurrentSession({ ...blankSession, messageCount: 1 })).toBe(false)
  })

  test("does not reuse a session before its messages finish loading", () => {
    expect(canReuseCurrentSession({ ...blankSession, messagesLoading: true })).toBe(false)
    expect(canReuseCurrentSession({ ...blankSession, hasSession: false })).toBe(false)
  })
})
