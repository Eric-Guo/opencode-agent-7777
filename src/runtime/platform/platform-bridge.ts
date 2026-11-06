import { ACCEPTED_FILE_EXTENSIONS, type AttachmentPickerLifecycle } from "./file-picker"
import type { DesktopAPI } from "./desktop-api"

type DesktopAttachmentAPI = Pick<
  DesktopAPI,
  "openFilePicker" | "readPickedFile" | "releasePickedFiles" | "getPathForFile" | "readClipboardImage"
>

type AttachmentPlatform = {
  openAttachmentPickerDialog?: (
    options: { defaultPath?: string; multiple?: boolean; accept?: string[] },
    onFile: (file: File) => Promise<unknown>,
    lifecycle?: AttachmentPickerLifecycle,
  ) => Promise<void>
  getPathForFile?: (file: File) => string
  readClipboardImage?: () => Promise<File | null>
}

export function createPlatformAttachments(
  api: DesktopAttachmentAPI | undefined = typeof window === "undefined" ? undefined : window.api,
): AttachmentPlatform {
  const attachmentPaths = new WeakMap<File, string>()
  const openFilePicker = api?.openFilePicker?.bind(api)
  const readPickedFile = api?.readPickedFile?.bind(api)
  const releasePickedFiles = api?.releasePickedFiles?.bind(api)
  const readClipboardImage = api?.readClipboardImage?.bind(api)
  const canPick = openFilePicker && readPickedFile && releasePickedFiles

  return {
    openAttachmentPickerDialog: canPick
      ? async (options, onFile, lifecycle) => {
          const signal = lifecycle?.signal
          signal?.throwIfAborted()
          const result = await openFilePicker({
            multiple: options.multiple ?? false,
            defaultPath: options.defaultPath,
            extensions: [...ACCEPTED_FILE_EXTENSIONS],
          })
          if (!result) return
          try {
            signal?.throwIfAborted()
            if (result.files.length) lifecycle?.selected()
            for (const file of result.files) {
              signal?.throwIfAborted()
              const bytes = await withPickerCancellation(() => readPickedFile(result.token, file.path), signal)
              signal?.throwIfAborted()
              const selected = new File([bytes], file.name)
              attachmentPaths.set(selected, file.path)
              await withPickerCancellation(() => onFile(selected), signal)
            }
            signal?.throwIfAborted()
            // The composer can send once ingestion finishes; token cleanup is independent.
            lifecycle?.complete()
          } finally {
            const release = releasePickedFiles(result.token)
            if (lifecycle) void release.catch(() => {})
            else await release
          }
        }
      : undefined,
    getPathForFile:
      canPick || api?.getPathForFile
        ? (file) => attachmentPaths.get(file) ?? api?.getPathForFile?.(file) ?? ""
        : undefined,
    readClipboardImage: readClipboardImage
      ? async () => {
          const image = await readClipboardImage().catch(() => null)
          if (!image) return null
          return new File([image.buffer], `pasted-image-${Date.now()}.png`, { type: "image/png" })
        }
      : undefined,
  }
}

// Native RPC reads cannot be aborted remotely. Settle locally so cancellation still releases the token.
function withPickerCancellation<T>(read: () => Promise<T>, signal?: AbortSignal) {
  if (!signal) return read()
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel)
      reject(signal.reason)
    }
    if (signal.aborted) return cancel()
    signal.addEventListener("abort", cancel, { once: true })
    Promise.try(read).then(
      (bytes) => {
        signal.removeEventListener("abort", cancel)
        if (signal.aborted) reject(signal.reason)
        else resolve(bytes)
      },
      (error) => {
        signal.removeEventListener("abort", cancel)
        reject(error)
      },
    )
  })
}

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
  typeof window !== "undefined" && window.electron && !window.api
    ? waitForDesktopRpcPort()
    : undefined
const desktopRpcClient = desktopRpcPort ? await import("@/runtime/platform/desktop-rpc-client") : undefined
const desktopApi = desktopRpcPort && desktopRpcClient ? desktopRpcClient.createDesktopApi(desktopRpcPort) : undefined

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

export function getDesktopCybrosCurrentUser() {
  return window.api?.getCybrosCurrentUser?.()
}

export function syncPlatformBackgroundColor(color: string) {
  void window.api?.setBackgroundColor?.(color)
}

export function showPlatformNotification(title: string, body?: string) {
  if (!window.api?.showNotification) return false
  window.api.showNotification(title, body)
  return true
}
