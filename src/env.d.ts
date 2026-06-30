type DesktopServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

type DesktopAPI = {
  awaitInitialization: () => Promise<DesktopServerReadyData>
  setBackgroundColor?: (color: string) => Promise<void>
}

declare global {
  interface Window {
    api?: DesktopAPI
  }
}

export {}
