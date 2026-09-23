import type { SessionUserActions } from "@opencode/session-ui/actions"
import { Composer } from "@/composer/composer"
import { createPromptModelSelection } from "@/composer/selection"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { createSessionRequestModel } from "@/session/requests/model"
import { createSessionRevert } from "@/session/revert"
import { createSessionComposerController, type SessionComposerController } from "./controller"
import { SessionComposerRegion } from "./session-composer-region"
import { SessionQueuePanel } from "./queue-panel"

export function createActiveSessionRegion() {
  const requests = createSessionRequestModel()
  const revert = createSessionRevert({ disabled: requests.blocked })
  const selection = createPromptModelSelection()
  const active = createSessionComposerController({
    controls: () => ({
      agent: currentLocalAgent(),
      model: { selection, status: state.modelStatus },
    }),
    dock: { state: requests, ready: () => state.status === "ready" && !revert.busy() },
  })
  const revertMessage: NonNullable<SessionUserActions["revert"]> = ({ messageID }) => revert.to(messageID)

  return {
    active,
    requests,
    actions: {
      revert,
      timeline: {
        get revert() {
          return revert.canUndo() ? revertMessage : undefined
        },
      } satisfies SessionUserActions,
    },
  }
}

export type ActiveSessionRegionModel = ReturnType<typeof createActiveSessionRegion>

export function ActiveSessionComposerRegion(props: { model: SessionComposerController }) {
  return (
    <SessionComposerRegion
      controller={props.model.region}
      composer={
        <>
          <SessionQueuePanel queue={props.model.queue} />
          <Composer model={props.model.composer} />
        </>
      }
    />
  )
}
