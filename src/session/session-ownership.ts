import { currentRuntime, currentSession, state } from "@/runtime/server/session-store-compact"

// Capture the request target and its right to update the active UI together.
// Runtime identity distinguishes a fresh activation of the same session, even
// when it reuses the client. The session ID also guards selection before activation.
export function captureSessionOwnership() {
  const active = currentSession()
  if (!active) return
  const runtime = currentRuntime()

  return {
    ...active,
    current: () => currentRuntime() === runtime && state.session?.id === active.sessionID,
  }
}
