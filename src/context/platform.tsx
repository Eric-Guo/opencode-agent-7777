export const windowsElectron =
  navigator.userAgent.includes("Electron") && navigator.platform.toLowerCase().startsWith("win")

export function awaitDesktopInitialization() {
  return window.api?.awaitInitialization?.()
}

export function syncPlatformBackgroundColor(color: string) {
  void window.api?.setBackgroundColor?.(color)
}

export function showPlatformNotification(title: string, body?: string) {
  if (!window.api?.showNotification) return false
  window.api.showNotification(title, body)
  return true
}
