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

type ProviderGroup = { category: string; items: { provider: { name: string } }[] }

export function sortProviderGroups(a: ProviderGroup, b: ProviderGroup) {
  const aRank = popularProviders.indexOf(a.category)
  const bRank = popularProviders.indexOf(b.category)
  const aPopular = aRank >= 0
  const bPopular = bRank >= 0
  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular) return aRank - bRank
  return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
}
