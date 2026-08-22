import { describe, expect, test } from "bun:test"
import type { TranslationKey, TranslationParams } from "@/runtime/i18n/language"
import { compactSessionStatusText } from "./screen-layout-compact"

const t = (key: TranslationKey, params?: TranslationParams) =>
  params && "attempt" in params ? `${key}:${params.attempt}` : key

describe("compact session status text", () => {
  test.each([
    {
      name: "starting",
      input: { status: "loading" as const, submitting: false, sessionStatus: { type: "idle" as const } },
      expected: "session.status.starting",
    },
    {
      name: "offline",
      input: { status: "failed" as const, submitting: false, sessionStatus: { type: "idle" as const } },
      expected: "session.status.offline",
    },
    {
      name: "sending",
      input: { status: "ready" as const, submitting: true, sessionStatus: { type: "busy" as const } },
      expected: "session.status.sending",
    },
    {
      name: "working",
      input: { status: "ready" as const, submitting: false, sessionStatus: { type: "busy" as const } },
      expected: "session.status.working",
    },
    {
      name: "retrying",
      input: {
        status: "ready" as const,
        submitting: false,
        sessionStatus: { type: "retry" as const, attempt: 2, message: "retrying", next: 10 },
      },
      expected: "session.status.retry:2",
    },
    {
      name: "ready",
      input: { status: "ready" as const, submitting: false, sessionStatus: { type: "idle" as const } },
      expected: "session.status.ready",
    },
  ])("selects $name", ({ input, expected }) => {
    expect(compactSessionStatusText(t, input)).toBe(expected)
  })
})
