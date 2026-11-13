import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve, relative, isAbsolute, sep } from "node:path"
import { Client } from "@cybros/agent"
import { Schema } from "effect"
import { discover } from "@opencode/client/service"
import { createDesktopBridge, nexusService } from "../server/desktop"
import type { Connection, Snapshot } from "../src/nexus/chat"
import type { Review } from "../src/nexus/inspection"

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
async function call(tool: string, args: object) {
  const chat = await api<{ id: string }>("chats", {
    title: "OpenCode native runner smoke — " + tool,
    key: randomUUID(),
    runner: active.runner,
  })
  const route = "chats/" + chat.id
  const input = {
    text: "!mock echo=content tool_call=" + tool + ":" + encodeURIComponent(JSON.stringify(args)) + " -- use " + tool,
    key: randomUUID(),
    model: null,
    approval: "ask",
  }
  const receipt = await api<{ ticket: string }>(route + "/prepare", input)
  const accepted = await api<{ id: string }>(route + "/inputs", { ...input, ticket: receipt.ticket })
  const deadline = AbortSignal.timeout(90000)
  while (true) {
    deadline.throwIfAborted()
    const snapshot = await api<Snapshot>(route)
    if (snapshot.problem) throw new Error(snapshot.problem)
    for (const decision of snapshot.decisions.filter((item) => item.kind === "approval" && item.tool === tool)) {
      await api(route + "/decisions", { run: decision.run, key: decision.key, response: { action: "approve" } })
    }
    const turn = snapshot.turns.find((entry) => entry.input === accepted.id && entry.run)
    if (turn?.status === "completed" && turn.variant) return { chat, route, turn, input: accepted.id }
    await Bun.sleep(250)
  }
}
const read = await call("read", { path: local })
if (!read.turn.text.includes(expected)) throw new Error("The assistant did not return the fixture.")
const acceptedEvent = Schema.Struct({
  input_public_id: Schema.String,
  answering_user_public_id: Schema.String,
  authored_by: Schema.Struct({ kind: Schema.String, handle: Schema.String }),
})
const events = await client.workspace(status.identity.workspace).conversation(read.chat.id).events({ limit: 100 })
const matched = events.items
  .filter((event) => event.type === "input_accepted")
  .map((event) => Schema.decodeUnknownSync(acceptedEvent)(event.payload))
  .find((event) => event.input_public_id === read.input)
if (
  matched?.authored_by.kind !== "human" ||
  matched.authored_by.handle !== human.member.handle ||
  matched.answering_user_public_id !== status.identity.agent
)
  throw new Error("Nexus recorded the wrong Human or answering agent.")

const filename = "nexus-smoke-" + randomUUID() + ".txt"
const file = Bun.file(resolve(status.directory, filename))
const written = await call("write", { path: filename, content: "checkpoint fixture" })
if ((await file.text()) !== "checkpoint fixture") throw new Error("The runner did not write the fixture.")
const query = "?turn=" + written.turn.id + "&variant=" + written.turn.variant
const reviews = await api<Review[]>(written.route + "/review" + query)
const change = reviews.find((item) => item.restorable && item.files.some((f) => f.path === filename))
if (!change) throw new Error("The answer has no restorable file review.")
await api(written.route + "/restore-files" + query, { task: change.base, receipt: randomUUID() })
if (await file.exists()) throw new Error("Restoring the creation left the file in the project.")
console.log(
  "The paired service verified Human authorship, read the fixture and restored a file from its answer review.",
)
