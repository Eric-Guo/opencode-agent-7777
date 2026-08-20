// Live current-message cache for the one active session.
import type { SessionInboxInfo, SessionMessageInfo } from "@opencode-ai/client/promise"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { currentSession, setState, state } from "@/context/server-session-store"
import type { OpencodeClient } from "@/context/server-sdk-client"

let messageRefreshCount = 0

function isDialogRoot(message: SessionMessageInfo) {
  return message.type === "user" || message.type === "shell"
}

function chronologicalMessages(messages: SessionMessageInfo[]) {
  return [
    ...messages
      .reduce((byID, message) => {
        byID.set(message.id, message)
        return byID
      }, new Map<string, SessionMessageInfo>())
      .values(),
  ].sort((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
}

// Admitted-but-undelivered inbox items never appear in message.list, so the live cache unions them
// (and locally echoed submissions) into the session message list until the server delivers them.
const echoes = new Map<string, SessionMessageInfo>()

export function inboxItemMessage(item: SessionInboxInfo): SessionMessageInfo | undefined {
  if (item.type === "user")
    return {
      id: item.id,
      type: "user",
      metadata: item.payload.metadata,
      text: item.payload.text,
      files: item.payload.files,
      agents: item.payload.agents,
      skills: item.payload.skills,
      time: { created: item.timeCreated },
    }
  if (item.type === "synthetic")
    return {
      id: item.id,
      type: "synthetic",
      metadata: item.payload.metadata,
      text: item.payload.text,
      description: item.payload.description,
      time: { created: item.timeCreated },
    }
  return undefined
}

export function mergeInboxMessages(input: {
  delivered: SessionMessageInfo[]
  admitted: SessionInboxInfo[]
  echoes: SessionMessageInfo[]
}) {
  const admitted = input.admitted.flatMap((item) => {
    const message = inboxItemMessage(item)
    return message ? [message] : []
  })
  return chronologicalMessages([...input.echoes, ...admitted, ...input.delivered])
}

export function echoPendingUserMessage(message: SessionMessageInfo) {
  const active = currentSession()
  echoes.set(message.id, message)
  if (!active) return
  const sessionMessages = chronologicalMessages([...state.sessionMessages, message])
  setState("sessionMessages", sessionMessages)
}

export function dropPendingEcho(messageID: string) {
  if (!echoes.delete(messageID)) return
  removeMessage(messageID)
}

export function resetPendingEchoes() {
  echoes.clear()
}

export async function loadRecentMessageWindow(input: {
  client: OpencodeClient
  sessionID: string
  limit: number
  dialogLimit?: number
}) {
  const dialogLimit = input.dialogLimit ?? HISTORY_DIALOG_LIMIT
  const messages: SessionMessageInfo[] = []
  const dialogRoots = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const page = await input.client.message.list(
      cursor
        ? { sessionID: input.sessionID, limit: input.limit, cursor }
        : { sessionID: input.sessionID, limit: input.limit, order: "desc" },
    )
    messages.push(...page.data)
    page.data.forEach((message) => {
      if (isDialogRoot(message)) dialogRoots.add(message.id)
    })

    const next = page.cursor.next ?? undefined
    if (dialogRoots.size >= dialogLimit || !next || page.data.length === 0 || cursors.has(next)) break
    cursors.add(next)
    cursor = next
  }

  return chronologicalMessages(messages)
}

export function refreshMessages(limit: number) {
  const active = currentSession()
  if (!active || !state.session) return Promise.resolve()
  messageRefreshCount += 1
  setState("messagesLoading", true)
  return Promise.all([
    loadRecentMessageWindow({ client: active.client, sessionID: active.sessionID, limit }),
    active.client.session.inbox.list({ sessionID: active.sessionID }),
  ])
    .then(([delivered, inbox]) => {
      const session = state.session
      if (session?.id !== active.sessionID) return
      // message.list only returns durable completed messages; assistant turns, compactions, and shells
      // still streaming through session events must survive the refresh while the session is busy.
      const inflight =
        state.sessionStatus.type === "busy"
          ? state.sessionMessages.filter((message) => {
              if (message.type === "assistant") return !message.time.completed
              if (message.type === "compaction" || message.type === "shell") return message.status === "running"
              return false
            })
          : []
      const sessionMessages = mergeInboxMessages({
        delivered,
        admitted: inbox,
        echoes: [...echoes.values(), ...inflight],
      })
      const covered = new Set([...delivered.map((message) => message.id), ...inbox.map((item) => item.id)])
      for (const id of [...echoes.keys()]) if (covered.has(id)) echoes.delete(id)
      return sessionMessages
    })
    .then((sessionMessages) => {
      if (!sessionMessages || state.session?.id !== active.sessionID) return
      setState("sessionMessages", sessionMessages)
    })
    .finally(() => {
      messageRefreshCount = Math.max(0, messageRefreshCount - 1)
      if (messageRefreshCount === 0) setState("messagesLoading", false)
    })
}

export function removeMessage(messageID: string) {
  setState("sessionMessages", (items) => items.filter((item) => item.id !== messageID))
}
