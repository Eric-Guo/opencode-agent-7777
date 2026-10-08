// One compact attachment policy for browser input, content detection and desktop picker filters.
const IMAGE_FORMATS = [
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
] as const
const PDF_FORMAT = ["application/pdf", "pdf"] as const
const TEXT_FORMATS = [
  ["application/json", "json"],
  ["application/ld+json", "jsonld"],
  ["application/toml", "toml"],
  ["application/x-toml", "toml"],
  ["application/x-yaml", "yaml"],
  ["application/xml", "xml"],
  ["application/yaml", "yaml"],
] as const

export const ACCEPTED_IMAGE_TYPES: readonly string[] = Object.freeze(IMAGE_FORMATS.map(([mime]) => mime))
export const ACCEPTED_TEXT_TYPES: readonly string[] = Object.freeze(TEXT_FORMATS.map(([mime]) => mime))

export const ACCEPTED_FILE_TYPES = Object.freeze([
  ...ACCEPTED_IMAGE_TYPES,
  PDF_FORMAT[0],
  "text/*",
  ...ACCEPTED_TEXT_TYPES,
  ".c",
  ".cc",
  ".cjs",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".cts",
  ".env",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".hh",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".m4a",
  ".md",
  ".mdx",
  ".mjs",
  ".mp3",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".wav",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
])

const MIME_EXT = new Map<string, string>([...IMAGE_FORMATS, PDF_FORMAT, ...TEXT_FORMATS])
const imageMimes = new Set<string>(ACCEPTED_IMAGE_TYPES)
const textMimes = new Set<string>(ACCEPTED_TEXT_TYPES)
const inlineExtensions = new Map<string, string>(
  [...IMAGE_FORMATS, PDF_FORMAT].map(([mime, extension]) => [extension, mime]),
)
// Accept the legacy filename alias without changing the native picker's existing .jpg filter.
inlineExtensions.set("jpeg", "image/jpeg")

const TEXT_EXT = ["txt", "text", "md", "markdown", "log", "csv"]

export const ACCEPTED_FILE_EXTENSIONS = Object.freeze(
  Array.from(
    new Set(
      ACCEPTED_FILE_TYPES.flatMap((item) => {
        if (item.startsWith(".")) return [item.slice(1)]
        if (item === "text/*") return TEXT_EXT
        const out = MIME_EXT.get(item)
        return out ? [out] : []
      }),
    ),
  ).sort(),
)

export function filePickerFilters(name: string, ext?: string[]) {
  if (!ext || ext.length === 0) return undefined
  return [{ name, extensions: ext }]
}

export async function attachmentMime(file: File) {
  const type = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  if (imageMimes.has(type) || type === PDF_FORMAT[0]) return type
  const index = file.name.lastIndexOf(".")
  const suffix = index === -1 ? "" : file.name.slice(index + 1).toLowerCase()
  const fallback = inlineExtensions.get(suffix)
  if ((!type || type === "application/octet-stream") && fallback) return fallback
  if (type.startsWith("text/") || textMimes.has(type) || type.endsWith("+json") || type.endsWith("+xml")) {
    return "text/plain"
  }
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  if (bytes.some((byte) => byte === 0)) return
  const control = bytes.filter((byte) => byte < 9 || (byte > 13 && byte < 32)).length
  if (bytes.length > 0 && control / bytes.length > 0.3) return
  return "text/plain"
}
