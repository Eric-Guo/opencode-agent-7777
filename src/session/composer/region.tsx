import type { SessionMessageInfo } from "@opencode/client/promise"
import { Composer } from "@/composer/composer"
import { createPromptModelSelection } from "@/composer/selection"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { createSessionRequestModel } from "@/session/requests/model"
import { createSessionFork } from "@/session/fork"
import { createSessionRevert } from "@/session/revert"
import { createSessionComposerController, type SessionComposerController } from "./controller"
import { SessionComposerRegion } from "./session-composer-region"
import { createTimelineActions } from "./timeline-actions"
import { SessionQueuePanel } from "./queue-panel"

export function createActiveSessionRegion(visibleMessages: () => SessionMessageInfo[]) {
  const requests = createSessionRequestModel()
  const revert = createSessionRevert({ disabled: requests.blocked })
  const selection = createPromptModelSelection()
  const fork = createSessionFork({
    visibleMessages,
    preparingAttachments: () => active.composer.preparingAttachments(),
  })
  const active: SessionComposerController = createSessionComposerController({
    openFork: () => fork()?.openPicker,
    controls: () => ({
      agent: currentLocalAgent(),
      model: { selection, status: state.modelStatus },
    }),
    dock: { state: requests, ready: () => state.status === "ready" && !revert.busy() },
  })

  return {
    active,
    requests,
    actions: {
      revert,
      timeline: createTimelineActions({
        revert,
        fork,
        chooseModel: () =>
          state.session && !state.session.parentID && !state.recentSessionSwitchingID
            ? active.composer.chooseModel()
            : undefined,
      }),
    },
  }
}

export type ActiveSessionRegionModel = ReturnType<typeof createActiveSessionRegion>

export function ActiveSessionComposerRegion(props: {
  model: SessionComposerController
  suggestionBoundary: () => HTMLElement | undefined
}) {
  return (
    <SessionComposerRegion
      controller={props.model.region}
      composer={
        <>
          <SessionQueuePanel queue={props.model.queue} />
          <Composer model={props.model.composer} suggestionBoundary={props.suggestionBoundary} />
        </>
      }
    />
  )
}
