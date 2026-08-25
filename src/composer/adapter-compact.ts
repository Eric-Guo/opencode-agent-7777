import type { Accessor } from "solid-js"

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
