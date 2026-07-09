import { translateSync } from "@/context/language"

export function readableError(error: unknown) {
  if (!error) return translateSync("error.requestFailed")
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error === "object" && "data" in error) {
    const data = error.data
    if (typeof data === "object" && data && "message" in data && typeof data.message === "string") return data.message
  }
  return String(error)
}

export function isSessionNotFoundError(error: unknown, sessionID: string) {
  const body = unwrapErrorBody(error)
  if (typeof body !== "object" || body === null) {
    const message = readableError(error)
    return message === `Session not found: ${sessionID}` || message.includes(`Session not found: ${sessionID}`)
  }
  const value = body as Record<string, unknown>
  return value._tag === "SessionNotFoundError" && value.sessionID === sessionID
}

function unwrapErrorBody(error: unknown) {
  if (error instanceof Error && error.cause && typeof error.cause === "object" && "body" in error.cause) {
    return (error.cause as Record<string, unknown>).body
  }
  return error
}
