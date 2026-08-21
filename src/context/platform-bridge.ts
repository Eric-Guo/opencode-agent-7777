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

const desktopRpcPort =
  typeof window !== "undefined" && isElectronUserAgent(navigator.userAgent) && !window.api
    ? waitForDesktopRpcPort()
    : undefined
const desktopRpcClient = desktopRpcPort ? await import("@/context/desktop-rpc-client") : undefined
const desktopApi =
  desktopRpcPort && desktopRpcClient ? desktopRpcClient.createDesktopApi(desktopRpcPort) : undefined

if (desktopApi && !window.api) window.api = desktopApi

function waitForDesktopRpcPort() {
  return new Promise<MessagePort>((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data !== "desktop-rpc-port") return
      const port = event.ports[0]
      if (!port) return
      window.removeEventListener("message", onMessage)
      resolve(port)
    }
    window.addEventListener("message", onMessage)
  })
}

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
