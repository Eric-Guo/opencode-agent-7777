import config from "@/new-session/agent-default-config.json"

export type AgentDefaultConfig = {
  localAgent: string
  welcomeText: string
  suggestedQuestions: string[]
}

export const AGENT_DEFAULT_CONFIG = config as AgentDefaultConfig
