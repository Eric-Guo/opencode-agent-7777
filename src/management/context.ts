import { createContext } from "solid-js"
import type { ModuleHost } from "./modules"

export const ModuleContext = createContext<{
  host: ModuleHost
  terminal(target: { run: string; task: string }): void
}>()
