import type { Accessor } from "solid-js"
import type { ComposerControls } from "@/composer/adapter"
import { createComposerModel } from "@/composer/model"
import { createActiveComposerAdapter } from "./adapter"
import { createSessionComposerRegionController } from "./session-composer-region-controller"

export function createSessionComposerController(input: {
  controls: Accessor<ComposerControls>
  dock: Parameters<typeof createSessionComposerRegionController>[0]
}) {
  const region = createSessionComposerRegionController(input.dock)
  const adapter = createActiveComposerAdapter({ controls: input.controls, disabled: region.disabled })
  const composer = createComposerModel(adapter)

  return { region, composer }
}

export type SessionComposerController = ReturnType<typeof createSessionComposerController>
