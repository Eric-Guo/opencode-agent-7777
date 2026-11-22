import type { SessionUserActions } from "@opencode/session-ui/actions"
import type { createSessionFork } from "@/session/fork"
import type { createSessionRevert } from "@/session/revert"

export function createTimelineActions(input: {
  revert: ReturnType<typeof createSessionRevert>
  fork: ReturnType<typeof createSessionFork>
  chooseModel: () => SessionUserActions["chooseModel"]
}): SessionUserActions {
  const revert: NonNullable<SessionUserActions["revert"]> = ({ messageID }) => input.revert.to(messageID)
  return {
    get revert() {
      return input.revert.canUndo() ? revert : undefined
    },
    get fork() {
      const action = input.fork()
      return action?.available() ? action.fork : undefined
    },
    get chooseModel() {
      return input.chooseModel()
    },
  }
}
