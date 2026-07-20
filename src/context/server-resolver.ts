import { awaitDesktopInitialization } from "@/context/platform-bridge"
import { AGENT_DEFAULT_CONFIG } from "@/context/agent-default-config"

// Resolves the single server used by 7777 rather than exposing the main app's server registry context.

export type ServerInfo = {
  url: string
  localAgent: string
  welcomeText: string
  suggestedQuestions: string[]
  username?: string
  password?: string
}

function configuredServerUrl() {
  const port = import.meta.env.VITE_OPENCODE_SERVER_PORT
  if (!port) return

  const host = import.meta.env.VITE_OPENCODE_SERVER_HOST || location.hostname
  return `http://${host}:${port}`
}

export function resolveServer(): Promise<ServerInfo> {
  const desktopInitialization = awaitDesktopInitialization()
  if (desktopInitialization) {
    return desktopInitialization.then((data) => ({
      url: data.url,
      localAgent: data.localAgent ?? AGENT_DEFAULT_CONFIG.localAgent,
      welcomeText: data.welcomeText ?? AGENT_DEFAULT_CONFIG.welcomeText,
      suggestedQuestions: data.suggestedQuestions ?? AGENT_DEFAULT_CONFIG.suggestedQuestions,
      username: data.username ?? undefined,
      password: data.password ?? undefined,
    }))
  }

  if (import.meta.env.DEV) {
    return Promise.resolve({ url: location.origin, ...AGENT_DEFAULT_CONFIG })
  }

  return Promise.resolve({ url: configuredServerUrl() ?? location.origin, ...AGENT_DEFAULT_CONFIG })
}
