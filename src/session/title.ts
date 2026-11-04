import { displayLabel } from "@opencode/util/session-title-fallback"

export function sessionLabel(session: { title?: string; parentID?: string }) {
  return displayLabel(session)
}

export function sessionTitle(title?: string) {
  // Recent sessions use the local agent for absent titles; the shared formatter supplies labels for present ones.
  return title ? displayLabel({ title }) : title
}
