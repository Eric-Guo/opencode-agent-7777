import type { SessionDocument } from "@opencode/session-ui/document"
import type { SessionMessageInfo, SessionStatus } from "@opencode/client/promise"
import { createMemo, type Accessor } from "solid-js"
import { projectTimelineHistory } from "./controller-projection"

export function createCompactTimelineModel(input: {
  sessionID: Accessor<string>
  messages: Accessor<SessionMessageInfo[]>
  loading: Accessor<boolean>
  revertMessageID?: Accessor<string | undefined>
  status?: Accessor<SessionStatus>
}) {
  const history = createMemo(() => projectTimelineHistory(input.messages(), input.revertMessageID?.()))
  const visibleMessages = createMemo(() => history().messages)
  const userDialogCount = createMemo(() => history().dialogCount)
  const ready = createMemo(() => userDialogCount() > 0 || !input.loading())
  const document = createMemo(
    (): SessionDocument => ({
      sessionID: input.sessionID(),
      messages: visibleMessages(),
      status: input.status?.() ?? { type: "idle" },
      diffs: [],
    }),
  )
  return { document, ready, visibleMessages, userDialogCount }
}
