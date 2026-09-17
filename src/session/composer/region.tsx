import type { SessionUserActions } from "@opencode/session-ui/actions"
import { Composer } from "@/composer/composer"
import { createPromptModelSelection } from "@/composer/selection"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { createSessionRequestModel } from "@/session/requests/model"
import { createSessionRevert } from "@/session/revert"
import { createSessionComposerController, type SessionComposerController } from "./controller"
import { SessionComposerRegion } from "./session-composer-region"

export function createActiveSessionRegion() {
  const requests = createSessionRequestModel()
  const selection = createPromptModelSelection()
  const active = createSessionComposerController({
    controls: () => ({
      agent: currentLocalAgent(),
      model: { selection, status: state.modelStatus },
    }),
    dock: { state: requests, ready: () => state.status === "ready" },
  })
  const revert = createSessionRevert()

  return {
    active,
    requests,
    actions: {
      timeline: {
        revert: (input) => revert.to(input.messageID),
      } satisfies SessionUserActions,
    },
  }
}

export type ActiveSessionRegionModel = ReturnType<typeof createActiveSessionRegion>

export function ActiveSessionComposerRegion(props: { model: SessionComposerController }) {
  return <SessionComposerRegion controller={props.model.region} composer={<Composer model={props.model.composer} />} />
}
