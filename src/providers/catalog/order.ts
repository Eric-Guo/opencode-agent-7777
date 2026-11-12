export const popularProviders = [
  "opencode-go",
  "opencode",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]

type Provider = { id: string; name: string }

export function compareProviders(a: Provider, b: Provider) {
  const aRank = popularProviders.indexOf(a.id)
  const bRank = popularProviders.indexOf(b.id)
  const aPopular = aRank >= 0
  const bPopular = bRank >= 0
  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular) return aRank - bRank
  return a.name.localeCompare(b.name)
}
