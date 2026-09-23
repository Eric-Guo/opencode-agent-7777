import { Option, Schema } from "effect"
import { PromptDraft } from "@/composer/schema"
import { AGENT_DEFAULT_CONFIG } from "@/new-session/agent-default-config"

export type BlobReference = { id: string; url: string }

const decodePromptDraft = Schema.decodeUnknownOption(Schema.fromJsonString(PromptDraft))

async function blobID(blob: Blob) {
  const bytes = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))
    : crypto.getRandomValues(new Uint8Array(16))
  const id = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return id
}

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => reject(reader.error))
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""))
    reader.readAsDataURL(blob)
  })
}

// The compact draft stores data URLs, so every reference survives a reload without a separate blob store.
export async function createBlobReference(blob: Blob): Promise<BlobReference> {
  return { id: await blobID(blob), url: await dataUrl(blob) }
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

function storageGet(key: string) {
  if (typeof localStorage !== "object") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

function storageRemove(key: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.removeItem(key)
  } catch {
    return
  }
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
