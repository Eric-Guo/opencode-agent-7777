import { createMemo, type Accessor } from "solid-js"
import type { SessionRequestModel } from "@/session/requests/model"

export function createSessionComposerRegionController(input: { state: SessionRequestModel; ready: Accessor<boolean> }) {
  return {
    state: input.state,
    // The compact dock keeps the draft visible while a request blocks editing.
    disabled: createMemo(() => !input.ready() || input.state.blocked()),
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
