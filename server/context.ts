import { APIError } from "@cybros/agent"
import type { Backend } from "./nexus"

export async function readSystemPrompt(
  chat: ReturnType<Backend["workspace"]["conversation"]>,
  turn: string,
  variant: string,
) {
  try {
    const { entries } = await chat.turns.request(turn, variant)
    return (
      entries
        .flatMap((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            Array.isArray(entry) ||
            entry.role !== "system" ||
            !Array.isArray(entry.parts)
          )
            return []
          return entry.parts.flatMap((part) =>
            part &&
            typeof part === "object" &&
            !Array.isArray(part) &&
            part.type === "text" &&
            typeof part.text === "string"
              ? [part.text]
              : [],
          )
        })
        .join("\n\n")
        .trim() || null
    )
  } catch (error) {
    if (
      error instanceof APIError &&
      ((error.status === 404 && error.code === "request_not_sealed") ||
        (error.status === 410 && error.code === "execution_details_pruned"))
    )
      return null
    throw error
  }
}
