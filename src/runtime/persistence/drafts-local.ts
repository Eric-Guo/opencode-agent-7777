export type BlobReference = { id: string; url: string }

async function blobID(blob: Blob) {
  const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())))
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

export async function createPersistedBlobReference(blob: Blob): Promise<BlobReference> {
  return { id: await blobID(blob), url: await dataUrl(blob) }
}

export async function blobDataUrl(blob: BlobReference, mime: string) {
  const data = await fetch(blob.url).then((response) => response.blob())
  const value = await dataUrl(data)
  return `data:${mime};base64,${value.slice(value.indexOf(",") + 1)}`
}

export function createLegacyBlobReference(dataUrl: string): BlobReference {
  return { id: dataUrl, url: dataUrl }
}
