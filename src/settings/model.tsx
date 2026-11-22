import type { ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { ComposerDelivery } from "@/composer/adapter"
import {
  readFollowUpBehavior,
  timelinePreferences,
  writeFollowUpBehavior,
} from "@/runtime/persistence/settings-storage-compact"
import { SettingsContextProvider } from "./context"

export { useSettings } from "./context"

export type FollowUpBehavior = ComposerDelivery

export function createSettings() {
  const [store, setStore] = createStore({
    followUpBehavior: readFollowUpBehavior(),
    showReasoningSummaries: timelinePreferences.showReasoningSummaries.read(),
    showTurnDiffs: timelinePreferences.showTurnDiffs.read(),
    wrapCodeBlocks: timelinePreferences.wrapCodeBlocks.read(),
  })
  const setTimelinePreference = (key: keyof typeof timelinePreferences) => (value: boolean) => {
    setStore(key, value)
    timelinePreferences[key].write(value)
  }
  return {
    general: {
      showReasoningSummaries: () => store.showReasoningSummaries,
      setShowReasoningSummaries: setTimelinePreference("showReasoningSummaries"),
      showTurnDiffs: () => store.showTurnDiffs,
      setShowTurnDiffs: setTimelinePreference("showTurnDiffs"),
      wrapCodeBlocks: () => store.wrapCodeBlocks,
      setWrapCodeBlocks: setTimelinePreference("wrapCodeBlocks"),
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
