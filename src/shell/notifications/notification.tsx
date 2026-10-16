import type { PermissionRequest } from "@opencode/client/promise"
import { translateSync, type TranslationKey } from "@/runtime/i18n/language"
import { showPlatformNotification } from "@/runtime/platform/platform-bridge"

function permissionDescription(permission: string) {
  const key = `settings.permissions.tool.${permission}.description` as TranslationKey
  const value = translateSync(key)
  if (value === key) return translateSync("notification.permission.title")
  return value
}

// The request adapter selects the active tree's permission; the shell owns delivery and deduplication.
export function createPermissionNotifications() {
  const alerted = new Set<string>()

  return {
    clear() {
      alerted.clear()
    },
    forget(id: string) {
      alerted.delete(id)
    },
    notify(permission: PermissionRequest) {
      if (alerted.has(permission.id)) return
      alerted.add(permission.id)

      const title = translateSync("notification.permission.title")
      const body = permissionDescription(permission.action)
      if (showPlatformNotification(title, body)) return
      if (!("Notification" in window)) return

      void (async () => {
        const result =
          Notification.permission === "default"
            ? await Notification.requestPermission().catch(() => "denied" as NotificationPermission)
            : Notification.permission
        if (result === "granted") new Notification(title, { body })
      })()
    },
  }
}
