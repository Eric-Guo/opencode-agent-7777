import { expect, test } from "bun:test"
import { canOpenLocalPath } from "./open-in-app"

test("native open actions require both a host bridge and a local server", () => {
  const api = { openPath: async () => undefined }
  expect(canOpenLocalPath("http://localhost:4777", api)).toBe(true)
  expect(canOpenLocalPath("http://127.0.0.1:4096", api)).toBe(true)
  expect(canOpenLocalPath("http://[::1]:4096", api)).toBe(true)
  expect(canOpenLocalPath("http://localhost:4777")).toBe(false)
  expect(canOpenLocalPath("https://remote.example", api)).toBe(false)
  expect(canOpenLocalPath("invalid", api)).toBe(false)
})
