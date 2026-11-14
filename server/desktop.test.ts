import { expect, test } from "bun:test"
import { createDesktopBridge } from "./desktop"

test("the desktop bridge closes its loopback listener once and rejects subsequent requests", async () => {
  const bridge = await createDesktopBridge(() => ({}))
  try {
    const response = await bridge(new Request("http://renderer.invalid/not-a-route"))
    expect(response.status).toBe(404)
    await response.text()
  } finally {
    const first = bridge.dispose()
    expect(bridge.dispose()).toBe(first)
    await first
  }
  await expect(bridge(new Request("http://renderer.invalid/not-a-route"))).rejects.toThrow()
})
