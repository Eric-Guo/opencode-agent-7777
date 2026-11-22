import { createMarkdownBase } from "@opencode/ui/context/marked-base"
import { artifactMime } from "@opencode/util/artifact"
import type { OutputFile } from "../src/nexus/inspection"

// A bare filename is downloadable only when the run actually published or captured it.
export function outputPaths(text: string): OutputFile[] {
  const paths = new Map<string, OutputFile>()
  for (const [, path] of text.matchAll(
    /(?:^|[\s("'\x60])((?:\/|\.\.?\/)?[\w.@+-]*(?:\/[\w.@+-]+)*\.(?:png|jpe?g|gif|webp|avif|svg|ico|log|txt|json|md|markdown|zip|pdf))(?=$|[\s)"'\x60,.])/gi,
  )) {
    if (path.includes("/")) paths.set(path, { id: "path:" + path, name: path.split("/").at(-1)!, path: true })
  }
  return [...paths.values()]
}

function imagePath(href: string) {
  let value = href.trim().replace(/\\|%5c/gi, "/")
  if (/^file:/i.test(value)) {
    if (!URL.canParse(value)) return
    const url = new URL(value)
    if (url.hostname && url.hostname !== "localhost") return
    value = url.pathname.replace(/^\/([a-z]:\/)/i, "$1")
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:\//i.test(value)) return
  try {
    const path = decodeURIComponent(value)
    if (path.startsWith("//") || /[\u0000-\u001f\u007f]/.test(path)) return
    return path
  } catch {
    return undefined
  }
}

export function hasAnswerImage(text: string, path: string) {
  if (!artifactMime(path)?.startsWith("image/") || !text.includes("![")) return false
  const markdown = createMarkdownBase()
  let found = false
  markdown.walkTokens(markdown.lexer(text), (token) => {
    if (token.type === "image" && imagePath(token.href) === path) found = true
  })
  return found
}
