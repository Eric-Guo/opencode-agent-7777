import type { SessionDocument } from "@opencode/session-ui/document"
import { HISTORY_DIALOG_LIMIT } from "../constants/session"
import { liveKey, type Connection, type Snapshot } from "./chat"

export function timeline(
  id: string,
  snapshot: Snapshot,
  live: Record<string, string>,
  connection?: Connection,
): SessionDocument {
  const messages: SessionDocument["messages"] = []
  const model = { id: connection?.model ?? "", providerID: "nexus" }
  const agent = connection?.agent ?? "rho"
  const user = (id: string, text: string, created: number, selected = model) => {
    messages.push({ id, type: "user", text, time: { created }, metadata: { agent, model: selected } })
  }
  for (const turn of snapshot.turns) {
    if (turn.prompt !== null) user(turn.id + "-prompt", turn.prompt, turn.created, turn.model)
    const running = ["running", "pending"].includes(turn.status)
    const text = (running && turn.variant ? live[liveKey(turn.id, turn.variant)] : undefined) ?? turn.text
    const thought = running && turn.variant ? live[liveKey(turn.id, turn.variant) + "/reasoning"] : undefined
    if (text || running || turn.variant)
      messages.push({
        id: turn.id,
        type: "assistant",
        agent,
        model: turn.model ?? model,
        time: { created: turn.created, completed: running ? undefined : turn.completed },
        content: [
          ...(thought ? [{ type: "reasoning" as const, text: thought }] : []),
          ...(text ? [{ type: "text" as const, text }] : []),
        ],
      })
  }
  for (const input of snapshot.pending) {
    if (!snapshot.turns.some((turn) => turn.input === input.id)) user(input.id, input.text, input.created)
  }
  const first = messages.filter((message) => message.type === "user").at(-HISTORY_DIALOG_LIMIT)
  return {
    sessionID: id,
    status: { type: snapshot.busy ? "busy" : "idle" },
    diffs: [],
    messages: first ? messages.slice(messages.indexOf(first)) : messages,
  }
}
