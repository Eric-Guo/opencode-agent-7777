import type { SessionInfo } from "@opencode-ai/client"
import { DEFAULT_SESSION_DIRECTORY_NAME } from "@/constants/session"

export type Session = SessionInfo

export function sessionDirectory(session: Session) {
  return session.location.directory
}

export function normalizeSessionDirectory(directory: string) {
  const normalized = directory.replace(/[\\/]+$/, "")
  const parts = normalized.split(/[\\/]/)
  if (
    parts.length >= 2 &&
    parts.at(-1) === DEFAULT_SESSION_DIRECTORY_NAME &&
    parts.at(-2) === DEFAULT_SESSION_DIRECTORY_NAME
  ) {
    return normalized.slice(0, -(DEFAULT_SESSION_DIRECTORY_NAME.length + 1))
  }
  return normalized
}

export function defaultSessionDirectory(baseDirectory: string) {
  const separator = baseDirectory.includes("\\") ? "\\" : "/"
  const normalized = normalizeSessionDirectory(baseDirectory)
  const name = normalized.split(/[\\/]/).at(-1)
  if (name === DEFAULT_SESSION_DIRECTORY_NAME) return normalized
  return `${normalized}${separator}${DEFAULT_SESSION_DIRECTORY_NAME}`
}
