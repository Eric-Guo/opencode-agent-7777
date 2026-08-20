import type { SessionDocument } from "@opencode-ai/session-ui/document"
import type { SessionUserActions } from "@opencode-ai/session-ui/actions"
import { SessionTimeline, type SessionUserPresentation } from "@opencode-ai/session-ui/timeline"
import { createMemo } from "solid-js"
import { parseCommentNote, readPromptPresentation } from "@/utils/comment-note"

type CompactMessageTimelineProps = {
  document: SessionDocument
  actions?: SessionUserActions
  showReasoningSummaries: boolean
  onPointerGesture?: (target?: EventTarget | null) => void
}

export function CompactMessageTimeline(props: CompactMessageTimelineProps) {
  const presentation = createMemo(() =>
    Object.fromEntries(
      props.document.messages.flatMap((message): [string, SessionUserPresentation][] => {
        if (message.type !== "user") return []
        const value = readPromptPresentation(message.metadata)
        const parsed = value ? undefined : parseCommentNote(message.text)
        return [
          [
            message.id,
            {
              displayText: value?.displayText,
              comments: value?.comments ?? (parsed ? [parsed] : []),
            },
          ],
        ]
      }),
    ),
  )

  const handlePointerDown = (event: PointerEvent) => props.onPointerGesture?.(event.target)
  const handlePointerMove = (event: PointerEvent) => {
    if (event.buttons !== 1) return
    props.onPointerGesture?.(event.target)
  }

  return (
    <div data-slot="session-message-timeline" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
      <SessionTimeline
        document={props.document}
        presentation={presentation()}
        actions={props.actions}
        showReasoningSummaries={props.showReasoningSummaries}
        class="session-timeline-compact mx-auto w-full max-w-[1000px]"
      />
    </div>
  )
}
