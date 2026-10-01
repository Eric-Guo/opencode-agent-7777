import { afterEach, expect, test } from "bun:test"
import { isServer } from "solid-js/web"
import { createRoot } from "solid-js"
import { createData, type Data } from "@opencode/client/solid"
import type { OpenCodeClient } from "@opencode/client/promise"

// Effects and shared store subscriptions must run under Solid's browser build.
export function browserSuite(path: string, define: () => void) {
  if (!isServer) return define()
  test("reactive runtime contracts", () => {
    const result = Bun.spawnSync([process.execPath, "--conditions=browser", "test", path])
    expect(result.exitCode, result.stderr.toString()).toBe(0)
  })
}

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))
export function fixtureData(client: OpenCodeClient): Data {
  return createRoot((dispose) => {
    disposers.push(dispose)
    return createData({ directory: "/repo", api: () => client, event: { on: () => () => {}, listen: () => () => {} } })
  })
}
