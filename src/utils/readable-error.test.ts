import { describe, expect, test } from "bun:test"
import { readableError } from "./readable-error"

describe("readableError", () => {
  test("preserves protocol error messages used by the compact error banner", () => {
    expect(readableError({ name: "UnknownError", data: { message: "Server failed" } })).toBe("Server failed")
  })

  test("uses the translated request fallback for unknown values", () => {
    expect(readableError(0)).toBe("Request failed")
  })
})
