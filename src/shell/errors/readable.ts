import { translateSync, type TranslationKey } from "@/runtime/i18n/language"
import { formatServerError } from "@/runtime/server/errors"

export function readableError(error: unknown) {
  return formatServerError(
    error,
    (key, vars) => translateSync(key as TranslationKey, vars),
    translateSync("error.requestFailed"),
  )
}
