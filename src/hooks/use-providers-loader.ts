import type { OpencodeClient } from "@/context/sdk-directory-client"
import { sessionDirectory, type Session } from "@/context/session-directory"
import { selectProviderCatalog } from "@/hooks/provider-catalog"

// Imperative catalog loader for the compact store, not the main app's reactive useProviders hook.

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
  const defaultModel = await client.model.default({ location })
  const [providers, models] = await Promise.all([client.provider.list({ location }), client.model.list({ location })])
  return selectProviderCatalog({ providers: providers.data, models: models.data, defaultModel: defaultModel.data })
}
