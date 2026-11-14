import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import type { Conversation, CreateInput } from "@cybros/agent"
import { BridgeError } from "./nexus"

type RunnerChat = Pick<Conversation, "public_id" | "default_runner">
export type Submission = {
  key: string
  text: string
  model: string | null
  delivery?: CreateInput["delivery_mode"]
  approval?: CreateInput["approval_mode"]
  target?: string
}

function ticketKey(token: string) {
  return createHmac("sha256", token).update("7777 prepared reply v2").digest()
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
export function sealReply(token: string, scope: string, chat: RunnerChat, input: Submission) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", ticketKey(token), iv)
  cipher.setAAD(address(scope, chat, input))
  const bytes = Buffer.concat([cipher.update(JSON.stringify({ created: Date.now() })), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url")
}
export function openReply(token: string, scope: string, chat: RunnerChat, input: Submission, ticket: string) {
  let prepared: { created: number }
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
}
