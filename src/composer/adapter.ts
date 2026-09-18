import type { Accessor } from "solid-js"
import type { ModelLoadStatus, ModelSelectorState } from "@/providers/models/selection"
import type { PromptState } from "./state"

export type ComposerControls = {
  agent: string
  model: {
    selection: ModelSelectorState
    status: ModelLoadStatus
  }
}

// One embedded session supplies the editor state and actions.
export type ComposerAdapter = {
  state: PromptState
  identity: Accessor<string | undefined>
  controls: Accessor<ComposerControls>
  disabled: Accessor<boolean>
  working: Accessor<boolean>
  submitting: Accessor<boolean>
  placeholder: Accessor<string>
  onAttachmentError: (message: string) => void
  submit: (options?: { delivery?: ComposerDelivery }) => void
  interrupt: () => void
}

export type ComposerDelivery = "steer" | "queue"

// Delivery follows the main app; queued editing is optional in the compact view.
export type ComposerQueue = {
  count: Accessor<number>
  delivery: Accessor<ComposerDelivery>
  alternate: Accessor<ComposerDelivery | undefined>
  editing?: Accessor<string | undefined>
  confirmEdit?: (delivery: ComposerDelivery) => void
  cancelEdit?: () => void
  editFirst?: () => boolean
}
