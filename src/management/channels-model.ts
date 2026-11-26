export const acceptModes = ["off", "observe", "auto"] as const
export type GateMode = (typeof acceptModes)[number]

// Mirrors sourceKeyPattern in packages/nexus-runtime/src/channels.ts.
export const sourceKeyPattern = /^[a-z0-9][a-z0-9:._-]{0,63}$/

export function parseList(text: string) {
  return text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

export function sourceError(sourceKey: string, name: string) {
  if (!sourceKeyPattern.test(sourceKey)) return "Source key must match [a-z0-9][a-z0-9:._-]{0,63}."
  if (!name.trim()) return "A display name is required."
  if (new TextEncoder().encode(name.trim()).length > 128) return "The display name must be at most 128 bytes."
  return ""
}

export function ingestSummary(result: { outcome?: unknown; strength?: unknown }) {
  const outcome = typeof result.outcome === "string" && result.outcome ? result.outcome : "unknown"
  return typeof result.strength === "string" && result.strength ? outcome + " · " + result.strength : outcome
}
