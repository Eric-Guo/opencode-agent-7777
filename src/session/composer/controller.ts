import type { Accessor } from "solid-js"
import type { ComposerControls } from "@/composer/adapter"
import { createComposerModel } from "@/composer/model"
import { useSettings } from "@/settings/model"
import { createActiveComposerAdapter } from "./adapter"
import { createSessionComposerRegionController } from "./session-composer-region-controller"
import { createSessionQueue } from "./queue"

export function createSessionComposerController(input: {
  controls: Accessor<ComposerControls>
  dock: Parameters<typeof createSessionComposerRegionController>[0]
}) {
  const settings = useSettings()
  const region = createSessionComposerRegionController(input.dock)
  const adapter = createActiveComposerAdapter({ controls: input.controls, disabled: region.disabled })
  const queue = createSessionQueue({
    working: adapter.working,
    disabled: region.disabled,
    behavior: settings.general.followUpBehavior,
  })
  const composer = createComposerModel(adapter, { queue })

  return { region, composer, queue }
}

export type SessionComposerController = ReturnType<typeof createSessionComposerController>
