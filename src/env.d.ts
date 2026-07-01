type DesktopServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

type DesktopAPI = {
  awaitInitialization: () => Promise<DesktopServerReadyData>
  setBackgroundColor?: (color: string) => Promise<void>
  showNotification?: (title: string, body?: string) => void
}

declare global {
  interface Window {
    api?: DesktopAPI
  }
}

export {}
