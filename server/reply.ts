import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { APIError, type Conversation, type CreateInput, type JsonValue } from "@cybros/agent"
import { BridgeError, type Backend } from "./nexus"

type RunnerChat = Pick<Conversation, "public_id" | "default_runner">
type RhoGet = (path: string) => Promise<Response>
type ReplyContext = Pick<
  CreateInput,
  "tool_names" | "executor_contexts" | "inline" | "model" | "model_selection" | "fallback_models"
>
export function modelFields(explicit: string | null, configured: string, fallbacks: string[]): ReplyContext {
  const model = explicit || configured
  return {
    model: { model },
    model_selection: {
      source: explicit ? "explicit" : "default",
      model,
      constraint: explicit ? "route" : "any",
      alternatives: [],
    },
    fallback_models: fallbacks,
  }
}
export type Submission = {
  key: string
  text: string
  model: string | null
  delivery?: CreateInput["delivery_mode"]
  approval?: CreateInput["approval_mode"]
  target?: string
}

const RUNNER_TOOL_GUIDANCE =
  "Runner tools are discovered on demand. Use tool_search with one precise tool name " +
  "(for example, bash for shell commands or ls for directory listings). Use tool_call with the returned " +
  "name and input schema. If a search returns no tools, try the exact name alone."

export function runnerGuidance(): Pick<CreateInput, "inline"> {
  return { inline: [{ role: "developer", position: "lead", text: RUNNER_TOOL_GUIDANCE }] }
}

function absolute(path: unknown): path is string {
  // Validate the Runner's path syntax, independently of the bridge's operating system.
  return typeof path === "string" && /^(?:\/|[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(path)
}

type Binding = { root: string; directories: string[]; anchor: string | null }
function readBinding(value: unknown): Binding {
  const env = value as Partial<Binding> | null
  if (
    !absolute(env?.root) ||
    !Array.isArray(env.directories) ||
    !env.directories.every(absolute) ||
    (env.anchor !== null && typeof env.anchor !== "string")
  )
    throw new BridgeError(503, "rho needs a valid working directory and tool binding for this runner.")
  return { root: env.root, directories: env.directories, anchor: env.anchor }
}

// A chat can outlive the daemon that followed it. Its persisted rho binding still wins over the Runner default.
export async function storedBinding(workspace: Backend["workspace"], info: Conversation, runner: string) {
  let current = info
  const seen = new Set<string>()
  while (!seen.has(current.public_id)) {
    seen.add(current.public_id)
    const entries = workspace.conversation(current.public_id).storeEntries
    let after: string | undefined
    do {
      const page = await entries.list({ after })
      const row = page.items.find((item) => item.namespace === "rho.environment" && item.key === "binding/" + runner)
      if (row) return (await entries.fetch(row.public_id)).value
      after = page.next_after ?? undefined
    } while (after)
    if (!current.parent) return undefined
    current = await workspace.conversation(current.parent.public_id).fetch()
  }
  throw new BridgeError(503, "Could not resolve the conversation’s inherited runner binding.")
}

export async function replyContext(
  chat: RunnerChat,
  get: RhoGet,
  stored: (runner: string) => Promise<JsonValue | undefined>,
): Promise<ReplyContext> {
  const runner = chat.default_runner?.executor_public_id
  if (!runner) return {}

  const res = await get("/conversations/environment?public_id=" + encodeURIComponent(chat.public_id))
  const data = await res.json()
  let binding: Binding | undefined
  if (res.ok) {
    const env = data.environment
    if (env?.runner !== runner || env.conversation !== chat.public_id)
      throw new BridgeError(409, "The conversation’s runner changed. Retry your message.")
    if (env.source !== "default") binding = readBinding(env)
    else if (env.root != null) binding = readBinding({ ...env, anchor: chat.public_id })
  } else if (res.status === 404 && data.error?.code === "host_not_followed") {
    const record = await stored(runner)
    if (record !== undefined) binding = readBinding(record)
  } else {
    throw new BridgeError(503, "rho could not read this conversation’s tool environment.")
  }
  if (!binding) {
    const listing = await get("/runners")
    if (!listing.ok) throw new BridgeError(503, "rho could not discover the conversation’s runner.")
    const rows = (await listing.json()).runners
    const root = Array.isArray(rows) ? rows.find((row) => row.public_id === runner)?.root : undefined
    binding = readBinding({ root, directories: [], anchor: chat.public_id })
  }
  return {
    executor_contexts: { [runner]: { "rho.environment": binding } },
    ...runnerGuidance(),
  }
}

// The browser persists only this opaque ticket before submission. A retry can reproduce the accepted
// envelope across bridge restarts without trusting browser-supplied paths or retaining chat text on disk.
function ticketKey(token: string) {
  return createHmac("sha256", token).update("7777 prepared reply v1").digest()
}
function address(scope: string, chat: RunnerChat, input: Submission) {
  return Buffer.from(
    JSON.stringify([
      scope,
      chat.public_id,
      chat.default_runner?.executor_public_id,
      input.key,
      input.model,
      input.text,
      ...(input.delivery || input.approval || input.target ? [input.delivery, input.approval, input.target] : []),
    ]),
  )
}
export function sealReply(token: string, scope: string, chat: RunnerChat, input: Submission, context: ReplyContext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", ticketKey(token), iv)
  cipher.setAAD(address(scope, chat, input))
  const bytes = Buffer.concat([cipher.update(JSON.stringify({ context, created: Date.now() })), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url")
}
export function openReply(
  token: string,
  scope: string,
  chat: RunnerChat,
  input: Submission,
  ticket: string,
): CreateInput {
  let prepared: { context: ReplyContext; created: number }
  try {
    const bytes = Buffer.from(ticket, "base64url")
    const cipher = createDecipheriv("aes-256-gcm", ticketKey(token), bytes.subarray(0, 12))
    cipher.setAAD(address(scope, chat, input))
    cipher.setAuthTag(bytes.subarray(12, 28))
    prepared = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString())
  } catch {
    throw new BridgeError(409, "This send no longer matches the prepared reply. Edit the draft to send again.")
  }
  // Nexus retains input receipts for 24 hours. An older uncertain send needs an explicit new attempt.
  if (Date.now() - prepared.created >= 24 * 60 * 60 * 1000)
    throw new BridgeError(409, "This send has expired. Check the conversation before editing and sending again.")
  return {
    kind: "direct_reply",
    text: input.text,
    ...(input.model ? { model: { model: input.model } } : {}),
    ...(input.delivery ? { delivery_mode: input.delivery } : {}),
    ...(input.target ? { expected_steering_run_public_id: input.target } : {}),
    ...prepared.context,
    approval_mode: input.approval ?? "ask",
  }
}

export async function submitReply<T>(input: CreateInput, create: (input: CreateInput) => Promise<T>) {
  try {
    return await create(input)
  } catch (err) {
    if (input.approval_mode !== "ask" || !(err instanceof APIError)) throw err
    // A stricter profile rejects ask before creating a receipt. On replay the already accepted rules
    // envelope instead reports a digest mismatch. Both attempts must use the same Nexus input key.
    if (
      !(err.code === "validation_failed" && err.message.includes("only tightens the declaring profile")) &&
      err.code !== "idempotency_envelope_mismatch"
    )
      throw err
    return create({ ...input, approval_mode: "rules" })
  }
}
