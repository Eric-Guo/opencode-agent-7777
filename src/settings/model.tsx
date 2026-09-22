import { createSimpleContext } from "@opencode/ui/context"
import { createStore } from "solid-js/store"
import type { ComposerDelivery } from "@/composer/adapter"
import {
  readFollowUpBehavior,
  readShowReasoningSummaries,
  writeFollowUpBehavior,
  writeShowReasoningSummaries,
} from "@/runtime/persistence/settings-storage-compact"

export type FollowUpBehavior = ComposerDelivery

export function createSettings() {
  const [store, setStore] = createStore({
    followUpBehavior: readFollowUpBehavior(),
    showReasoningSummaries: readShowReasoningSummaries(),
  })
  return {
    general: {
      showReasoningSummaries: () => store.showReasoningSummaries,
      setShowReasoningSummaries(value: boolean) {
        setStore("showReasoningSummaries", value)
        writeShowReasoningSummaries(value)
      },
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
