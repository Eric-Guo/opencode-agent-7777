import { createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { openInAppParentPath } from "./open-in-app-path"

export const MAC_OPEN_APPS = [
  {
    id: "vscode",
    label: "session.header.open.app.vscode",
    icon: "vscode",
    openWith: "Visual Studio Code",
  },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "Cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "Zed" },
  { id: "textmate", label: "session.header.open.app.textmate", icon: "textmate", openWith: "TextMate" },
  {
    id: "antigravity",
    label: "session.header.open.app.antigravity",
    icon: "antigravity",
    openWith: "Antigravity",
  },
  { id: "terminal", label: "session.header.open.app.terminal", icon: "terminal", openWith: "Terminal" },
  { id: "iterm2", label: "session.header.open.app.iterm2", icon: "iterm2", openWith: "iTerm" },
  { id: "ghostty", label: "session.header.open.app.ghostty", icon: "ghostty", openWith: "Ghostty" },
  { id: "warp", label: "session.header.open.app.warp", icon: "warp", openWith: "Warp" },
  { id: "xcode", label: "session.header.open.app.xcode", icon: "xcode", openWith: "Xcode" },
  {
    id: "android-studio",
    label: "session.header.open.app.androidStudio",
    icon: "android-studio",
    openWith: "Android Studio",
  },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

export const WINDOWS_OPEN_APPS = [
  { id: "vscode", label: "session.header.open.app.vscode", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "zed" },
  {
    id: "powershell",
    label: "session.header.open.app.powershell",
    icon: "powershell",
    openWith: "powershell",
  },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

export const LINUX_OPEN_APPS = [
  { id: "vscode", label: "session.header.open.app.vscode", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "zed" },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

export function canOpenLocalPath(url: string, api?: Pick<NonNullable<Window["api"]>, "openPath">) {
  if (!api?.openPath) return false
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

export function useOpenInApp(input: { serverUrl: () => string; onError: (message: string) => void }) {
  const language = useLanguage()
  const platform = navigator.platform || navigator.userAgent
  const os = /Mac/i.test(platform) ? "macos" : /Win/i.test(platform) ? "windows" : "linux"
  const apps = os === "macos" ? MAC_OPEN_APPS : os === "windows" ? WINDOWS_OPEN_APPS : LINUX_OPEN_APPS
  const [store, setStore] = createStore({ available: [] as string[], opening: false })
  const canOpen = () => canOpenLocalPath(input.serverUrl(), window.api)
  const report = (error: unknown) => input.onError(error instanceof Error ? error.message : String(error))
  const fileManager = () =>
    language.t(
      os === "macos"
        ? "session.header.open.finder"
        : os === "windows"
          ? "session.header.open.fileExplorer"
          : "session.header.open.fileManager",
    )
  const options = createMemo(() => apps.filter((app) => store.available.includes(app.id)))

  createEffect(() => {
    if (!canOpen() || !window.api?.checkAppExists) return
    let active = true
    void Promise.all(
      apps.map(async (app) => ((await window.api!.checkAppExists!(app.openWith).catch(() => false)) ? app.id : "")),
    ).then((available) => {
      if (active) setStore("available", available)
    })
    onCleanup(() => {
      active = false
    })
  })

  return {
    canOpen,
    options,
    fileManager,
    opening: () => store.opening,
    async openPath(path: string, application?: string, reveal = false) {
      if (!canOpen() || store.opening || !path) return
      setStore("opening", true)
      try {
        if (reveal && window.api?.revealPath && (await window.api.revealPath(path))) return
        const error = await window.api!.openPath!(reveal ? openInAppParentPath(path) : path, application)
        if (error) throw new Error(error)
      } catch (error) {
        report(error)
      } finally {
        setStore("opening", false)
      }
    },
    copyPath: (path: string) => navigator.clipboard.writeText(path).catch(report),
  }
}
