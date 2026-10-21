import type { SessionInfo } from "@opencode/client/promise"
import type { Accessor } from "solid-js"
import type { HomeSessionIndex } from "./index"
import { compareSessionTime } from "./records"

// Match Home's controller boundary, with one directory and cursor-paged history.
export function createHomeSessionsController(input: {
  data: HomeSessionIndex
  switching: Accessor<boolean>
  open: (session: SessionInfo) => void
}) {
  return {
    data: {
      ...input.data,
      list: () => input.data.list().toSorted(compareSessionTime),
    },
    session: {
      switching: input.switching,
      open(session: SessionInfo) {
        if (input.switching()) return false
        const current = input.data.list().find((item) => item.id === session.id)
        if (!current) return false
        input.open(current)
        return true
      },
    },
  }
}

export type HomeSessionsController = ReturnType<typeof createHomeSessionsController>
