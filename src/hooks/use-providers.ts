import type { Session } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@/context/sdk"
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
  const result = await client.provider.list({
    query: { directory: session.directory },
  })
  return result.data ? selectProviderCatalog(result.data) : undefined
}
