import type { OpencodeClient } from "@/context/sdk"
import { sessionDirectory, type Session } from "@/context/session-directory"
import { selectProviderCatalog } from "@/hooks/provider-catalog"

export const popularProviders = [
  "opencode",
  "opencode-go",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]

export async function loadProviderCatalog(client: OpencodeClient, session: Session) {
  const location = { directory: sessionDirectory(session) }
  const [providers, models, defaultModel] = await Promise.all([
    client.provider.list({ location }),
    client.model.list({ location }),
    client.model.default({ location }),
  ])
  return selectProviderCatalog({ providers: providers.data, models: models.data, defaultModel: defaultModel.data })
}
