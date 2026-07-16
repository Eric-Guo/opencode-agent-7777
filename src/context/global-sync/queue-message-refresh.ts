// Debounced message refresh queue, not the main app's directory bootstrap queue.
import { setState } from "@/context/server-session-store"
import { readableError } from "@/utils/server-errors"

let refreshTimer: ReturnType<typeof setTimeout> | undefined

export function scheduleRefreshTask(refresh: () => Promise<void>, delay = 120) {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    void refresh().catch((error) => setState("error", readableError(error)))
  }, delay)
}

export function disposeRefreshQueue() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = undefined
  }
}
