type AgentModel = { providerID: string; modelID: string }

export function getConfiguredAgentVariant(input: {
  agent: { model?: AgentModel; variant?: string } | undefined
  model: (AgentModel & { variants?: Record<string, unknown> }) | undefined
}) {
  if (!input.agent?.variant || !input.agent.model || !input.model?.variants) return
  if (input.agent.model.providerID !== input.model.providerID) return
  if (input.agent.model.modelID !== input.model.modelID) return
  return input.agent.variant
}

type VariantInput = {
  variants: string[]
  selected: string | null | undefined
  configured: string | undefined
  preferred?: string
}

export function resolveModelVariant(input: VariantInput) {
  if (input.selected === null) return undefined
  const value = input.selected ?? input.preferred ?? input.configured
  return value && value !== "default" && input.variants.includes(value) ? value : undefined
}
