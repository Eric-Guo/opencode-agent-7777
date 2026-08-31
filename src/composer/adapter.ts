import type { Accessor } from "solid-js"
import type { ModelLoadStatus, ModelSelectorState } from "@/providers/models/store-compact"
import type { PromptState } from "./state"

export type ComposerControls = {
  agent: string
  model: {
    selection: ModelSelectorState
    status: ModelLoadStatus
  }
}

// One embedded session supplies the editor state and actions; no routed session or prompt queue is needed.
export type ComposerAdapter = {
  state: PromptState
  identity: Accessor<string | undefined>
  controls: Accessor<ComposerControls>
  disabled: Accessor<boolean>
  working: Accessor<boolean>
  placeholder: Accessor<string>
  onAttachmentError: (message: string) => void
  submit: () => void
  interrupt: () => void
}

export type ComposerDelivery = "steer" | "queue"

// The compact composer has no prompt queue, but the shared editor keeps this optional view contract.
export type ComposerQueue = {
  count: Accessor<number>
  delivery: Accessor<ComposerDelivery>
  alternate: Accessor<ComposerDelivery | undefined>
  editing: Accessor<string | undefined>
  confirmEdit: (delivery: ComposerDelivery) => void
  cancelEdit: () => void
  editFirst: () => boolean
}
