import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { APIError, type Conversation, type CreateInput } from "@cybros/agent"
import { BridgeError } from "./nexus"

type RunnerChat = Pick<Conversation, "public_id" | "default_runner">
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
