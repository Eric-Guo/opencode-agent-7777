/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENCODE_SERVER_HOST?: string
  readonly VITE_OPENCODE_SERVER_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type DesktopServerReadyData = {
  url: string
  username: string | null
  password: string | null
  localAgent?: string
  welcomeText?: string
  suggestedQuestions?: string[]
  ssoJwtSecretKey?: string
}

type CybrosCurrentUser = {
  chinese_name: string
  clerk_code: string
}

type DesktopPickedFile = {
  path: string
  name: string
  size: number
}

type DesktopAPI = {
  awaitInitialization: () => Promise<DesktopServerReadyData>
  getCybrosCurrentUser?: () => Promise<CybrosCurrentUser>
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
