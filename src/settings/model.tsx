import type { ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { ComposerDelivery } from "@/composer/adapter"
import {
  readFollowUpBehavior,
  readShowReasoningSummaries,
  readShowTurnDiffs,
  writeFollowUpBehavior,
  writeShowReasoningSummaries,
  writeShowTurnDiffs,
} from "@/runtime/persistence/settings-storage-compact"
import { SettingsContextProvider } from "./context"

export { useSettings } from "./context"

export type FollowUpBehavior = ComposerDelivery

export function createSettings() {
  const [store, setStore] = createStore({
    followUpBehavior: readFollowUpBehavior(),
    showReasoningSummaries: readShowReasoningSummaries(),
    showTurnDiffs: readShowTurnDiffs(),
  })
  return {
    general: {
      showReasoningSummaries: () => store.showReasoningSummaries,
      setShowReasoningSummaries(value: boolean) {
        setStore("showReasoningSummaries", value)
        writeShowReasoningSummaries(value)
      },
      showTurnDiffs: () => store.showTurnDiffs,
      setShowTurnDiffs(value: boolean) {
        setStore("showTurnDiffs", value)
        writeShowTurnDiffs(value)
      },
      followUpBehavior: () => store.followUpBehavior,
      setFollowUpBehavior(value: FollowUpBehavior) {
        setStore("followUpBehavior", value)
        writeFollowUpBehavior(value)
      },
    },
  }
}

export function SettingsProvider(props: ParentProps) {
  const settings = createSettings()
  return <SettingsContextProvider value={settings}>{props.children}</SettingsContextProvider>
}
