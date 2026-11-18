import type { SessionMessageInfo } from "@opencode/client/promise"
import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { isSessionDialogRoot } from "../session-domain"

export function projectTimelineHistory(messages: SessionMessageInfo[], revertMessageID?: string) {
  const visible = revertMessageID ? messages.filter((message) => message.id < revertMessageID) : messages
  let dialogCount = 0
  let firstRoot = 0
  for (let index = visible.length - 1; index >= 0; index--) {
    if (!isSessionDialogRoot(visible[index])) continue
    if (dialogCount === HISTORY_DIALOG_LIMIT) return { messages: visible.slice(firstRoot), dialogCount }
    dialogCount++
    firstRoot = index
  }
  // Keep leading notices and other context when the entire visible history fits.
  return { messages: visible, dialogCount }
}
