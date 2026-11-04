import type { Accessor } from "solid-js"

export type ComposerDelivery = "queue" | "steer"

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
