import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { middleware } from "./middleware"

export async function createDesktopBridge(
  config: () => { token?: string; home?: string } = () => ({
    token: process.env.NEXUS_MEMBER_TOKEN,
    home: process.env.RHO_HOME,
  }),
) {
  const authorization = `Bearer ${randomUUID()}`
  const handle = middleware(config)
  const server = createServer((request, response) => {
    if (request.headers.authorization !== authorization) return response.writeHead(403).end()

    void handle(request, response, () => response.writeHead(404).end())
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      server.unref()
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Nexus bridge has no loopback address")
  const origin = `http://127.0.0.1:${address.port}`

  return (request: Request) => {
    const url = new URL(request.url)
    const headers = new Headers({ authorization, origin })

    for (const name of ["content-type", "x-7777-scope"]) {
      const value = request.headers.get(name)
      if (value !== null) headers.set(name, value)
    }

    // Keep request and response bodies streaming for the middleware's limits and event stream.
    const init = {
      method: request.method,
      headers,
      body: request.body,
      duplex: "half",
      signal: request.signal,
      redirect: "error",
    } satisfies RequestInit & { duplex: "half" }
    return fetch(origin + url.pathname + url.search, init)
  }
}
