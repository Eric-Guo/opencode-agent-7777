import { createSimpleContext } from "@opencode/ui/context"
import { createStore } from "solid-js/store"
import type { ComposerDelivery } from "@/composer/adapter"
import { readFollowUpBehavior, writeFollowUpBehavior } from "@/runtime/persistence/settings-storage-compact"

export type FollowUpBehavior = ComposerDelivery

export function createSettings() {
  const [store, setStore] = createStore({ followUpBehavior: readFollowUpBehavior() })
  return {
    general: {
      followUpBehavior: () => store.followUpBehavior,
      setFollowUpBehavior(value: FollowUpBehavior) {
        setStore("followUpBehavior", value)
        writeFollowUpBehavior(value)
      },
    },
  }
}

export const { use: useSettings, provider: SettingsProvider } = createSimpleContext({
  name: "Settings",
  init: createSettings,
})
