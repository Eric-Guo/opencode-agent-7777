import type { PermissionRequest } from "@opencode/client/promise"
import { translateSync, type TranslationKey } from "@/runtime/i18n/language"
import { showPlatformNotification } from "@/runtime/platform/platform-bridge"
import { createNotificationState, pendingNotification, transitionNotification, type NotificationEvent } from "./machine"

type RequestKey = Pick<PermissionRequest, "sessionID" | "id">
const requestKey = (request: RequestKey) => JSON.stringify([request.sessionID, request.id])

function permissionDescription(permission: string) {
  const key = `settings.permissions.tool.${permission}.description` as TranslationKey
  const value = translateSync(key)
  if (value === key) return translateSync("notification.permission.title")
  return value
}

// The adapter owns eligibility. The shell owns the lifetime of each delivery attempt.
export function createPermissionNotifications(input: {
  signal: AbortSignal
  eligible: (request: RequestKey) => boolean
}) {
  let state = createNotificationState()
  const dispatch = (event: NotificationEvent) => {
    const next = transitionNotification(state, event)
    if (next === state) return
    state = next
    return next
  }
  const dispose = () => dispatch({ type: "disposed" })
  if (input.signal.aborted) dispose()
  else input.signal.addEventListener("abort", dispose, { once: true })

  async function deliver(permission: PermissionRequest, key: string, attempt: number) {
    try {
      if (typeof window === "undefined" || !input.eligible(permission)) return
      const title = translateSync("notification.permission.title")
      const body = permissionDescription(permission.action)
      if (showPlatformNotification(title, body)) return

      const BrowserNotification = window.Notification
      if (!BrowserNotification) return
      const access = BrowserNotification.permission
      const result = access === "default" ? await BrowserNotification.requestPermission() : access
      if (result === "granted" && pendingNotification(state, key) === attempt && input.eligible(permission)) {
        new BrowserNotification(title, { body })
      }
    } catch {
      // A denied or failed delivery leaves the permission in the dock for the user.
    } finally {
      dispatch({ type: "finished", key, attempt })
    }
  }

  return {
    clear() {
      dispatch({ type: "reset" })
    },
    forget(request: RequestKey) {
      dispatch({ type: "forgotten", key: requestKey(request) })
    },
    notify(permission: PermissionRequest) {
      const key = requestKey(permission)
      const next = dispatch({ type: "requested", key })
      if (next?.status === "active") void deliver(permission, key, next.attempt)
    },
  }
}
