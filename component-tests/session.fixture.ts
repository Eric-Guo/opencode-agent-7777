import { expect, type Page } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"

type WriteEvent =
  | { type: "session.deleted"; data: { sessionID: string } }
  | { type: "session.renamed"; data: { sessionID: string; title: string } }

export async function setupSession(page: Page, beforeResponse?: WriteEvent[], history: SessionMessageInfo[] = []) {
  const location = { directory: "C:\\Work\\Agent" }
  const sessions = ["First", "Second"].map((title, index) => ({
    id: `ses_${index}`,
    title,
    projectID: "project",
    location: index === 0 ? location : { directory: "c:/work/agent/" },
    agent: "7777",
    time: { created: index + 1, updated: index + 1 },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }))
  const messages = new Map([[sessions[0].id, history]])
  const writes: string[] = []
  const exports: string[] = []
  let firstStream = true
  const eventsReady = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const forkResponded = Promise.withResolvers<void>()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.assign(window, { api: { awaitInitialization: async () => ({ url: location.origin }) } })
    localStorage.setItem("opencode.7777.session.id", "ses_0")
  })
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path === "/api/event") {
      if (!firstStream || !beforeResponse)
        return route.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" })
      firstStream = false
      await eventsReady.promise
      const body = beforeResponse
        .map((event, index) => {
          const session = sessions.find((item) => item.id === event.data.sessionID)
          if (session && event.type === "session.renamed") session.title = event.data.title
          const envelope = {
            ...event,
            id: `evt_fixture_${index}`,
            created: 10 + index,
            location: session?.location ?? location,
            durable: { aggregateID: event.data.sessionID, seq: index + 1, version: 2 },
          }
          return `data: ${JSON.stringify(envelope)}\n\n`
        })
        .join("")
      return route.fulfill({ contentType: "text/event-stream", body })
    }
    if (path === "/api/session/active") return json({ data: {} })
    if (path === "/api/session") return json({ data: sessions, cursor: {} })
    const session = sessions.find((s) => path === `/api/session/${s.id}`)
    if (session && request.method() === "GET") return json({ data: session })
    if (session && request.method() === "PATCH") {
      writes.push(`rename ${session.id}`)
      session.title = request.postDataJSON().title
      eventsReady.resolve()
      if (beforeResponse) await release.promise
      return route.fulfill({ status: 204 })
    }
    if (session && request.method() === "DELETE") {
      writes.push(`delete ${session.id}`)
      sessions.splice(sessions.indexOf(session), 1)
      eventsReady.resolve()
      if (beforeResponse) await release.promise
      return route.fulfill({ status: 204 })
    }
    if (path === "/api/session/ses_0/fork" && request.method() === "POST") {
      const { before } = request.postDataJSON()
      const boundary = history.findIndex((message) => message.id === before)
      expect(boundary).toBeGreaterThanOrEqual(0)
      writes.push(`fork ${before}`)
      const fork = { ...sessions[0], id: "ses_fork", title: "Fork" }
      sessions.push(fork)
      messages.set(fork.id, history.slice(0, boundary))
      await release.promise
      return json({ data: fork }).finally(forkResponded.resolve)
    }
    if (path.endsWith("/export")) {
      const id = path.split("/").at(-2)!
      exports.push(id)
      await release.promise
      return json({ data: { info: sessions.find((s) => s.id === id), messages: [] } })
    }
    if (path.endsWith("/message"))
      return json({ data: messages.get(path.split("/").at(-2)!)?.toReversed() ?? [], cursor: {} })
    if (path === "/api/model/default") return json({ location, data: null })
    if (path.startsWith("/api/fs/read/")) return route.fallback()
    if (request.method() === "GET") return json({ location, data: [] })
    throw new Error(`Unexpected ${request.method()} ${path}`)
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Options for First" })).toBeVisible()
  return { writes, exports, release, forkResponded: forkResponded.promise, emitEvents: eventsReady.resolve, errors }
}
