/// <reference types="vite/client" />
import type { DesktopAPI } from "@/runtime/platform/desktop-api"

interface ImportMetaEnv {
  readonly VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY?: string
  readonly VITE_OPENCODE_SERVER_HOST?: string
  readonly VITE_OPENCODE_SERVER_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type ElectronNative = {
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    api?: DesktopAPI
    electron: ElectronNative
  }
}

export {}
