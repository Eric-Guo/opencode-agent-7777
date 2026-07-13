import config from "@/context/agent-welcome-config.json"

type AgentWelcomeConfig = {
  welcomeText: string
  suggestedQuestions: string[]
}

export const AGENT_WELCOME_CONFIG = config as AgentWelcomeConfig
