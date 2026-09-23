import { afterEach, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { currentDraft, setSessionClient, setState, state } from "@/runtime/server/session-store-compact"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { translateSync } from "@/runtime/i18n/language"
import { openRecentSession } from "./switcher-compact"

browserSuite(import.meta.path, () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    setSessionClient(undefined)
    setState({ server: undefined, session: undefined, error: "", recentSessionSwitchingID: undefined })
    globalThis.fetch = originalFetch
  })
  test("deleted-session recovery adopts the new draft owner and releases switching", async () => {
    const requests: Request[] = []
    globalThis.fetch = (async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      const path = new URL(request.url).pathname
      if (path === "/api/location") return Response.json({ directory: "/repo" })
      if (path === "/api/session/active") return Response.json({ data: {} })
      if (path === "/api/session/missing/message" || path === "/api/session/missing/inbox")
        return Response.json(
          { _tag: "SessionNotFoundError", sessionID: "missing", message: "Session not found: missing" },
          { status: 404 },
        )
      if (path === "/api/model/default") return Response.json({ data: null })
      return Response.json({ data: [], cursor: {} })
    }) as typeof fetch
    setState("server", { url: "http://recovery.fixture", localAgent: "7777", welcomeText: "", suggestedQuestions: [] })
    await openRecentSession({ id: "missing", location: { directory: "/repo" } } as SessionInfo)
    expect(state.session).toBeUndefined()
    expect(currentDraft()?.directory).toBe("/repo/agent-plm-meeting")
    expect(state.recentSessionSwitchingID).toBeUndefined()
    expect(state.error).toBe(translateSync("session.recovered.new"))
    expect(requests.every((request) => request.method === "GET")).toBe(true)
  })
})
