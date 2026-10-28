import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"
import { lastAssistantWithUsage } from "@opencode/client/solid"
import type { ModelOption } from "@/providers/models/models"

type ContextModel = Pick<ModelOption, "id" | "providerID" | "name" | "providerName" | "limit">

// One local catalog adapter serves the header and details; the client owns usage-step selection.
export function sessionContextUsage(input: {
  session: Pick<SessionInfo, "revert" | "tokens"> | undefined
  messages: readonly SessionMessageInfo[]
  models: readonly ContextModel[]
}) {
  const message = input.session ? lastAssistantWithUsage(input.messages, input.session.revert?.messageID) : undefined
  const model =
    message && input.models.find((item) => item.providerID === message.model.providerID && item.id === message.model.id)
  const total = message && tokenTotal(message.tokens)
  return {
    message,
    model,
    total,
    usage: total !== undefined && model?.limit.context ? Math.round((total / model.limit.context) * 100) : undefined,
    sessionTotal: input.session && tokenTotal(input.session.tokens),
  }
}

function tokenTotal(tokens: SessionInfo["tokens"]) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}
