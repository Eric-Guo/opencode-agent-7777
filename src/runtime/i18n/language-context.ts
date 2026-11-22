import { createSimpleContext } from "@opencode/ui/context"
import type { Language } from "./language"

// Translation edits can refresh the provider and its consumers independently.
export const { use: useLanguage, provider: LanguageContextProvider } = createSimpleContext({
  name: "Language",
  gate: false,
  init: (props: { value: Language }) => props.value,
})
