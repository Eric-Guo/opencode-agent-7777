import { DEFAULT_SESSION_DIRECTORY_NAME } from "@/constants/session"
import type { SessionInfo as Session } from "@opencode/client/promise"

export function sessionDirectory(session: Session) {
  return session.location.directory
}

export function defaultSessionDirectory(baseDirectory: string) {
  const separator = baseDirectory.includes("\\") ? "\\" : "/"
  const normalized = baseDirectory.replace(/[\\/]+$/, "")
  const name = normalized.split(/[\\/]/).at(-1)
  if (name === DEFAULT_SESSION_DIRECTORY_NAME) return normalized
  return `${normalized}${separator}${DEFAULT_SESSION_DIRECTORY_NAME}`
}
