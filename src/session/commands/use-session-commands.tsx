import { createSimpleContext } from "@opencode/ui/context"
import type { createSessionCommands } from "./session-commands"

// Keep the context independent of the command implementations. A hot update can replace those
// implementations while a mounted provider and its consumers still need the same context identity.
export const { provider: SessionCommandsProvider, use: useSessionCommands } = createSimpleContext({
  name: "SessionCommands",
  init: (props: { value: ReturnType<typeof createSessionCommands> }) => props.value,
})
