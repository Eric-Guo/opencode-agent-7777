import config from "@/new-session/agent-default-config.json"

export type AgentStorageKeys = {
  sessionID: string
  sessionDirectory: string
  promptDraft: string
}

export type AgentDefaultConfig = {
  localAgent: string
  welcomeText: string
  suggestedQuestions: string[]
  storageKeys: AgentStorageKeys
}

export const AGENT_DEFAULT_CONFIG: AgentDefaultConfig = config
