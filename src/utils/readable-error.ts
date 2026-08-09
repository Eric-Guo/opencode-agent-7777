import { translateSync, type TranslationKey } from "@/context/language"
import { formatServerError } from "./server-errors"

export function readableError(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = error.data
    const name = "name" in error && typeof error.name === "string" ? error.name : undefined
    if (
      name !== "ConfigInvalidError" &&
      name !== "ProviderModelNotFoundError" &&
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message
    }
  }
  return formatServerError(
    error,
    (key, vars) => translateSync(key as TranslationKey, vars),
    translateSync("error.requestFailed"),
  )
}
