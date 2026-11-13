import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve, relative, isAbsolute, sep } from "node:path"
import { Client } from "@cybros/agent"
import { Schema } from "effect"
import { discover } from "@opencode/client/service"
import { createDesktopBridge, nexusService } from "../server/desktop"
import type { Connection, Snapshot } from "../src/nexus/chat"

// Run with a paired test service and a Nexus development deployment using dev/mock-priced.
const token = process.env.NEXUS_MEMBER_TOKEN
const origin = process.env.NEXUS_URL
const path = process.argv[2]
if (!token || !origin || !path)
  throw new Error("Supply NEXUS_URL, NEXUS_MEMBER_TOKEN and a project-relative text fixture.")
const endpoint = await discover({ file: process.env.OPENCODE_SERVICE_FILE })
if (!endpoint?.auth) throw new Error("Test service registration is unavailable.")
const connection = { url: endpoint.url, password: endpoint.auth.password }
const status = await nexusService(connection).status()
if (
  status.state !== "ready" ||
  !status.identity ||
  status.origin !== new URL(origin).origin ||
  status.model !== "dev/mock-priced"
)
  throw new Error("Pair the test service with the specified Nexus fixture and dev/mock-priced model first.")
const local = relative(status.directory, resolve(status.directory, path))
if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local))
  throw new Error("Use a fixture in the paired project.")
const expected = (await readFile(resolve(status.directory, local), "utf8")).trim()
if (!expected) throw new Error("The text fixture must have content.")
const bridge = await createDesktopBridge(() => ({
  token,
  native: { origin: status.origin, connection: async () => connection },
}))
let scope = ""
async function api<T>(route: string, data?: object): Promise<T> {
  const res = await bridge(
    new Request("http://localhost/api/7777/" + route, {
      method: data ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-7777-scope": encodeURIComponent(scope) },
      body: data ? JSON.stringify(data) : undefined,
    }),
  )
  if (!res.ok) throw new Error(route + " failed with HTTP " + res.status)
  return res.json()
}
const active = await api<Connection>("connection")
scope = active.scope
const client = new Client({ baseURL: status.origin, credential: token })
const human = await client.profile.fetch()
const chat = await api<{ id: string }>("chats", {
  title: "OpenCode native runner smoke",
  key: randomUUID(),
  runner: active.runner,
})
const route = "chats/" + chat.id
const input = {
  text:
    "!mock echo=content tool_call=read:" + encodeURIComponent(JSON.stringify({ path: local })) + " -- read the fixture",
  key: randomUUID(),
  model: null,
  approval: "ask",
}
const receipt = await api<{ ticket: string }>(route + "/prepare", input)
const accepted = await api<{ id: string }>(route + "/inputs", { ...input, ticket: receipt.ticket })
const conversation = client.workspace(status.identity.workspace).conversation(chat.id)
const deadline = Date.now() + 90000
while (true) {
  const snapshot = await api<Snapshot>(route)
  for (const decision of snapshot.decisions.filter((item) => item.kind === "approval" && item.tool === "read")) {
    await api(route + "/decisions", { run: decision.run, key: decision.key, response: { action: "approve" } })
  }
  const turns = await conversation.turns.list({})
  if (turns.items.some((turn) => turn.role === "assistant" && turn.active_variant?.content?.includes(expected))) {
    const acceptedEvent = Schema.Struct({
      input_public_id: Schema.String,
      answering_user_public_id: Schema.String,
      authored_by: Schema.Struct({ kind: Schema.String, handle: Schema.String }),
    })
    const events = await conversation.events({ limit: 100 })
    const matched = events.items
      .filter((event) => event.type === "input_accepted")
      .map((event) => Schema.decodeUnknownSync(acceptedEvent)(event.payload))
      .find((event) => event.input_public_id === accepted.id)
    if (
      !matched ||
      matched.authored_by.kind !== "human" ||
      matched.authored_by.handle !== human.member.handle ||
      matched.answering_user_public_id !== status.identity.agent
    )
      throw new Error("Nexus recorded the wrong Human or answering agent.")
    break
  }
  if (snapshot.problem || Date.now() >= deadline)
    throw new Error(snapshot.problem ?? "Timed out waiting for the runner result.")
  await Bun.sleep(250)
}
console.log("Nexus recorded the Human prompt and returned the local fixture through the packaged runner.")
