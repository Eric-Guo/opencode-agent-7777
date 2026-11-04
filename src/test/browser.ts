import { expect, test } from "bun:test"
import { isServer } from "solid-js/web"

// Effects must run under Solid's browser build without the removed OpenCode runtime fixtures.
export function browserSuite(path: string, define: () => void) {
  if (!isServer) return define()
  test("reactive browser contracts", () => {
    const result = Bun.spawnSync([process.execPath, "--conditions=browser", "test", path])
    expect(result.exitCode, result.stderr.toString()).toBe(0)
  })
}
