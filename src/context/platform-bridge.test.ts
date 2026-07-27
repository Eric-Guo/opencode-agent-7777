import { describe, expect, test } from "bun:test"
import { isAgent7777Enabled, isElectronUserAgent } from "@/context/platform-bridge"

describe("agent7777 environment gate", () => {
  test("enables Electron when Electron-only activation is enabled", () => {
    expect(isAgent7777Enabled("Mozilla/5.0 Electron/40.0.0", true)).toBe(true)
  })

  test("disables a browser when Electron-only activation is enabled", () => {
    expect(isAgent7777Enabled("Mozilla/5.0 Chrome/150.0.0.0", true)).toBe(false)
  })

  test("enables a browser when Electron-only activation is disabled", () => {
    expect(isAgent7777Enabled("Mozilla/5.0 Chrome/150.0.0.0", false)).toBe(true)
  })

  test("excludes WeCom and WeChat from Electron detection", () => {
    expect(isElectronUserAgent("Mozilla/5.0 Electron/40.0.0 wxwork")).toBe(false)
    expect(isElectronUserAgent("Mozilla/5.0 Electron/40.0.0 MicroMessenger")).toBe(false)
  })
})
