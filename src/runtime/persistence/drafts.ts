import { Option, Schema } from "effect"
import { PromptDraft } from "@/composer/schema"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"
import { storageGet, storageRemove, storageSet } from "./storage"

export type BlobReference = { id: string; url: string }

const decodePromptDraft = Schema.decodeUnknownOption(Schema.fromJsonString(PromptDraft))

async function blobID(blob: Blob, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const data = crypto.subtle ? await blob.arrayBuffer() : undefined
  signal?.throwIfAborted()
  const bytes = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest("SHA-256", data!))
    : crypto.getRandomValues(new Uint8Array(16))
  const id = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return id
}

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
  return { id: await blobID(blob, signal), url: await dataUrl(blob, signal) }
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
