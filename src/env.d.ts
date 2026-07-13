/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OPENCODE_SERVER_USERNAME?: string
  readonly OPENCODE_SERVER_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type DesktopServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

type DesktopPickedFile = {
  path: string
  name: string
  size: number
}

type DesktopAPI = {
  awaitInitialization: () => Promise<DesktopServerReadyData>
  openFilePicker?: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    extensions?: string[]
  }) => Promise<{ token: string; files: DesktopPickedFile[] } | null>
  readPickedFile?: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles?: (token: string) => Promise<void>
  getPathForFile?: (file: File) => string
  readClipboardImage?: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  setBackgroundColor?: (color: string) => Promise<void>
  showNotification?: (title: string, body?: string) => void
}

declare global {
  interface Window {
    api?: DesktopAPI
  }
}

export {}
