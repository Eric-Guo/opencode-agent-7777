export function isElectronUserAgent(userAgent: string) {
  const normalizedUserAgent = userAgent.toLowerCase()
  const isWxWork = normalizedUserAgent.includes("wxwork") || normalizedUserAgent.includes("micromessenger")

  return normalizedUserAgent.includes("electron") && !isWxWork
}

export function isAgent7777Enabled(userAgent: string, activateInElectronOnly: boolean) {
  return !activateInElectronOnly || isElectronUserAgent(userAgent)
}

export const windowsElectron =
  isElectronUserAgent(navigator.userAgent) && navigator.platform.toLowerCase().startsWith("win")

// Thin bridge to the embedding desktop shell; 7777 does not own a platform context provider.

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
