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
