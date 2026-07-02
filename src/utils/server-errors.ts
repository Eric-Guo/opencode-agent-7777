export function readableError(error: unknown) {
  if (!error) return "Request failed"
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error === "object" && "data" in error) {
    const data = error.data
    if (typeof data === "object" && data && "message" in data && typeof data.message === "string") return data.message
  }
  return String(error)
}
