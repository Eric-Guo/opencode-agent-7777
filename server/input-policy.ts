import type { ModeValues } from "../src/nexus/chat"
import { BridgeError, type Backend } from "./nexus"

export const defaultModes = { code_mode: true, subagent: true, available: true, code_mode_available: true }
export async function readModes(b: Backend, id: string) {
  return {
    ...(await b.native.modes({ workspace: b.workspaceID, conversation: id })),
    available: true,
  }
}
export async function updateModes(b: Backend, id: string, patch: Partial<ModeValues>) {
  const keys = Object.keys(patch)
  if (
    !keys.length ||
    keys.some((k) => !["code_mode", "subagent"].includes(k) || typeof patch[k as keyof ModeValues] !== "boolean")
  )
    throw new BridgeError(400, "Expected a boolean Code mode or Subagent choice.")
  return {
    ...(await b.native.modes({ workspace: b.workspaceID, conversation: id, patch })),
    available: true,
  }
}
