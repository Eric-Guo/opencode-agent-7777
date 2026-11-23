import { base64ToBytes } from "@opencode/util/base64"
import { Option, Schema } from "effect"
import { PromptDraft } from "@/composer/schema"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { storageGet, storageRemove, storageSet } from "./storage"

export type BlobReference = { id: string; url: string }

const decodePromptDraft = Schema.decodeUnknownOption(Schema.fromJsonString(PromptDraft))

function dataUrl(blob: Blob, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    signal?.throwIfAborted()
    const reader = new FileReader()
    const cleanup = () => signal?.removeEventListener("abort", cancel)
    const cancel = () => {
      cleanup()
      reader.abort()
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", cancel, { once: true })
    reader.addEventListener("error", () => {
      cleanup()
      reject(reader.error)
    })
    reader.addEventListener("load", () => {
      cleanup()
      resolve(typeof reader.result === "string" ? reader.result : "")
    })
    try {
      reader.readAsDataURL(blob)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

// The compact draft stores data URLs, so every reference survives a reload without a separate blob store.
export async function createBlobReference(blob: Blob, signal?: AbortSignal): Promise<BlobReference> {
  const url = await dataUrl(blob, signal)
  signal?.throwIfAborted()
  let id: Uint8Array
  if (crypto.subtle) {
    // Hash the saved bytes. A disk-backed clipboard file may be gone on a second read.
    // Only the MIME parameters can contain commas before the base64 payload.
    const comma = url.lastIndexOf(",")
    const data = base64ToBytes(comma < 0 ? "" : url.slice(comma + 1))
    id = new Uint8Array(await crypto.subtle.digest("SHA-256", data))
    signal?.throwIfAborted()
  } else {
    id = crypto.getRandomValues(new Uint8Array(16))
  }
  return { id: Array.from(id, (byte) => byte.toString(16).padStart(2, "0")).join(""), url }
}

export const createPersistedBlobReference = createBlobReference

export async function blobDataUrl(blob: BlobReference, mime: string) {
  const data = await fetch(blob.url).then((response) => response.blob())
  const value = await dataUrl(data)
  return `data:${mime};base64,${value.slice(value.indexOf(",") + 1)}`
}

export function createLegacyBlobReference(dataUrl: string): BlobReference {
  return { id: dataUrl, url: dataUrl }
}

function inlineBase64(url: string) {
  if (url === "data:" || url === "data:,") return ""
  // A comma in a quoted MIME parameter is part of the header.
  const header = /^data:(?:[^",]|"(?:[^"\\]|\\.)*")*?;base64,/i.exec(url)
  return header ? url.slice(header[0].length) : undefined
}

export function sameBlobContent(saved: BlobReference, picked: BlobReference) {
  if (saved.id === picked.id) return true
  // Restored messages carry URL-based IDs, and origins without SubtleCrypto generate random IDs.
  if (/^[a-f0-9]{64}$/.test(saved.id) && /^[a-f0-9]{64}$/.test(picked.id)) return false
  if (saved.url === picked.url) return saved.url.startsWith("data:")
  const payload = inlineBase64(saved.url)
  return payload !== undefined && payload === inlineBase64(picked.url)
}

export function readPromptDraft(key = AGENT_DEFAULT_CONFIG.storageKeys.promptDraft): PromptDraft | undefined {
  const value = storageGet(key)
  if (!value) return undefined
  const decoded = decodePromptDraft(value)
  if (Option.isNone(decoded) || (!decoded.value.prompt && decoded.value.attachments.length === 0)) {
    storageRemove(key)
    return undefined
  }
  return decoded.value
}

export function writePromptDraft(draft: PromptDraft, key = AGENT_DEFAULT_CONFIG.storageKeys.promptDraft) {
  if (!draft.prompt && draft.attachments.length === 0) {
    storageRemove(key)
    return
  }
  storageSet(key, JSON.stringify(draft))
}

export function clearPromptDraft(key = AGENT_DEFAULT_CONFIG.storageKeys.promptDraft) {
  storageRemove(key)
}
