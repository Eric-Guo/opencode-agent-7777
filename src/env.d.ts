/// <reference types="vite/client" />
import type { DesktopAPI } from "@/runtime/platform/desktop-api"
import type { BrowserPaneAPI } from "@/runtime/platform/browser-pane"

interface ImportMetaEnv {
  readonly VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY?: string
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
    electron?: ElectronNative
    nexusBrowser?: BrowserPaneAPI
  }
}

export {}
