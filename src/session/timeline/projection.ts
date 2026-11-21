import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"
import { createMemo, mapArray, mergeProps, type Accessor } from "solid-js"

// mapArray owns each view's lifetime. Its mapper is untracked, so track the kind separately:
// a snapshot can reconcile a text part into a reasoning part on the same store object.
function projectItems<T>(items: Accessor<T[]>, project: (item: T) => T) {
  const views = mapArray(items, (item) => createMemo(() => project(item)))
  return createMemo(() => views().map((view) => view()))
}

function projectContent(part: SessionMessageAssistant["content"][number]) {
  if (part.type !== "text") return part
  const text = createMemo(() => part.text.replace(/（(https?:\/\/[^\s（）]+)）/g, "（<$1>）"))
  return mergeProps(part, {
    get text() {
      return text()
    },
  })
}

export function createTimelineMessages(messages: Accessor<SessionMessageInfo[]>) {
  return projectItems(messages, (message) => {
    if (message.type !== "assistant") return message
    const content = projectItems(() => message.content, projectContent)
    return mergeProps(message, {
      get content() {
        return content()
      },
    })
  })
}
