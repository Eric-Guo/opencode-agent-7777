// Match the main app's interoperable file drag payload and drag preview.
export type Kind = "add" | "del" | "mix"

export function pathToFileUrl(path: string) {
  let normalized = path.replaceAll("\\", "/")
  if (/^[A-Za-z]:/.test(normalized)) normalized = `/${normalized}`
  const encoded = normalized
    .split("/")
    .map((part, index) => (index === 1 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join("/")
  return `file://${encoded}`
}

export function withFileDragImage(event: DragEvent) {
  const target = event.currentTarget as HTMLElement
  const image = target.cloneNode(true) as HTMLElement
  image.style.cssText = "position:absolute;top:-1000px;width:max-content;padding:4px 8px"
  document.body.appendChild(image)
  event.dataTransfer?.setDragImage(image, 0, 12)
  setTimeout(() => image.remove(), 0)
}
