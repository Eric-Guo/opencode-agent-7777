type Provider = {
  id: string
  canonical?: string
  integrationID?: string
  name: string
}

export function consoleProviderGroup<T extends Provider>(providers: readonly T[]) {
  const root = providers.find((provider) => provider.id === "opencode" && provider.integrationID === "opencode")
  const suffix = " / OpenCode"

  if (!root?.name.endsWith(suffix)) return
  const workspace = root.name.slice(0, -suffix.length).trim()

  if (!workspace) return
  const prefix = `${workspace} / `

  return {
    root,
    workspace,
    prefix,
    providers: providers.filter(
      (provider) => provider.integrationID === "opencode" && provider.name.startsWith(prefix),
    ),
  }
}

export function consoleProviderName(group: { prefix: string }, name: string) {
  return name.startsWith(group.prefix) ? name.slice(group.prefix.length) : name
}

// Use the full catalog so searching or hiding the Console root cannot change a provider's label.
export function consoleProviderLabels(providers: readonly Provider[]) {
  const group = consoleProviderGroup(providers)
  const managed = new Set(group?.providers.map((provider) => provider.id))
  const canonical = (provider: Provider) => provider.canonical ?? provider.id.replace(/^console-/, "")
  const direct = new Set(providers.filter((provider) => !managed.has(provider.id)).map(canonical))

  return (provider: Provider): { name: string; workspace?: string } => {
    if (!group || !managed.has(provider.id)) return { name: provider.name }
    return {
      name: consoleProviderName(group, provider.name),
      workspace: direct.has(canonical(provider)) ? group.workspace : undefined,
    }
  }
}
