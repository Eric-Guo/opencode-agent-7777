export const memoryGroups = ["speaker", "agent", "workspace", "conversation"] as const

export function memoryGroup(path: string) {
  if (!path.includes("/")) return "other"
  const prefix = path.split("/")[0]
  return (memoryGroups as readonly string[]).includes(prefix) ? prefix : "other"
}

export function groupMemory<T extends { path: string }>(rows: T[]) {
  return [...memoryGroups, "other"]
    .map((folder) => ({ folder, items: rows.filter((row) => memoryGroup(row.path) === folder) }))
    .filter((group) => group.items.length > 0)
}

export function filterMemory<T extends { path: string }>(rows: T[], scope: string, query: string) {
  const text = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (scope !== "all" && memoryGroup(row.path) !== scope) return false
    return !text || row.path.toLowerCase().includes(text)
  })
}

// Mirrors the runtime's memory document path rules (see memory-review.ts): plain relative segments only.
export function memoryPathError(path: string) {
  if (!path.trim()) return "Enter a document path."
  if (path.startsWith("/")) return "Use a relative path without a leading /."
  if (path.includes("\0")) return "The path contains an invalid character."
  if (path.split("/").some((part) => !part || part.startsWith(".")))
    return "Path segments must be plain names (no empty, dot or hidden segments)."
  return ""
}

// Mirrors the skill name rule in packages/nexus-runtime/src/operation-skills.ts.
export const skillNamePattern = /^[a-z0-9](?:-?[a-z0-9])*$/

export function skillNameError(name: string) {
  if (name.length > 64 || !skillNamePattern.test(name))
    return "Skill names use lowercase letters, digits and single dashes (up to 64 characters)."
  return ""
}
