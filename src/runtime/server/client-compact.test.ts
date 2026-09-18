import { describe, expect, test } from "bun:test"
import { createClientForServer, createServerSdk } from "./client-compact"
import { createDirectorySdk } from "./directory-client-compact"
import type { ServerInfo } from "./resolver-compact"

const server: ServerInfo = {
  url: "http://server",
  localAgent: "7777",
  welcomeText: "",
  suggestedQuestions: [],
}

function transport() {
  const requests: Request[] = []
  const pending: Array<() => void> = []
  const fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return new Promise<Response>((resolve) => pending.push(() => resolve(Response.json({ data: {} }))))
    },
    { preconnect() {} },
  )
  return { requests, pending, fetch }
}

describe("compact server transport", () => {
  test("shares the request budget across server and directory SDKs", async () => {
    const input = transport()
    const original = globalThis.fetch
    globalThis.fetch = input.fetch
    try {
      const clients = [
        createServerSdk(server).client,
        createDirectorySdk(server, "/first").client,
        createDirectorySdk({ ...server }, "/second").createClient(),
        createServerSdk({ ...server }).createClient(),
        createClientForServer({ server }),
      ]
      const requests = clients.map((client) => client.session.active())
      expect(input.requests).toHaveLength(4)
      input.pending.shift()!()
      await requests[0]
      expect(input.requests).toHaveLength(5)
      input.pending.splice(0).forEach((resolve) => resolve())
      await Promise.all(requests)
    } finally {
      globalThis.fetch = original
    }
  })

  test("keeps different server origins and injected transports independent", async () => {
    const input = transport()
    const other = transport()
    const requests = Array.from({ length: 4 }, () =>
      createClientForServer({ server, fetch: input.fetch }).session.active(),
    )
    requests.push(
      createClientForServer({ server: { ...server, url: "http://other-server" }, fetch: input.fetch }).session.active(),
      createClientForServer({ server, fetch: other.fetch }).session.active(),
    )
    expect(input.requests).toHaveLength(5)
    expect(other.requests).toHaveLength(1)
    input.pending.forEach((resolve) => resolve())
    other.pending.forEach((resolve) => resolve())
    await Promise.all(requests)
  })

  test("preserves each client's credentials and custom headers through the shared queue", async () => {
    const input = transport()
    const requests = ["first", "second"].map((password) =>
      createClientForServer({
        server: { ...server, password },
        fetch: input.fetch,
        headers: new Headers({ "x-client": password }),
      }).session.active(),
    )
    expect(input.requests.map((request) => request.headers.get("authorization"))).toEqual([
      `Basic ${btoa("opencode:first")}`,
      `Basic ${btoa("opencode:second")}`,
    ])
    expect(input.requests.map((request) => request.headers.get("x-client"))).toEqual(["first", "second"])
    input.pending.forEach((resolve) => resolve())
    await Promise.all(requests)
  })
})
