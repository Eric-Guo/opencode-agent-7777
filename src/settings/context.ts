import { createSimpleContext } from "@opencode/ui/context"
import type { createSettings } from "./model"

// Keep the context identity when Vite refreshes the settings provider.
export const { use: useSettings, provider: SettingsContextProvider } = createSimpleContext({
  name: "Settings",
  init: (props: { value: ReturnType<typeof createSettings> }) => props.value,
})
