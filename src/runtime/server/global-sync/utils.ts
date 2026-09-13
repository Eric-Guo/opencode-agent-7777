import type { ModelListOutput, ProviderListOutput } from "@opencode/client/promise"
import { unwrap } from "solid-js/store"
import type { Provider, ProviderListResponse } from "@/runtime/server/types"

const providerCatalogs = new WeakMap<
  ProviderListOutput["data"],
  WeakMap<ModelListOutput["data"], ProviderListResponse>
>()

export function normalizeProviderList(
  input: ProviderListOutput["data"] | ProviderListResponse,
  catalog?: ModelListOutput["data"],
): ProviderListResponse {
  if (!Array.isArray(input)) return input
  // Client sync replaces whole catalog lists. Track those reads at the caller,
  // not every model field, and share conversions without retaining old lists.
  const providers = unwrap(input)
  const models = unwrap(catalog)
  const cached = models && providerCatalogs.get(providers)?.get(models)
  if (cached) return cached
  const all = new Map<string, Provider>()

  for (const provider of providers) {
    all.set(provider.id, {
      id: provider.id,
      name: provider.name,
      source: "custom",
      env: [],
      options: provider.settings ?? {},
      models: {},
    })
  }

  for (const model of models ?? []) {
    const provider = all.get(model.providerID)
    if (!provider || model.status === "deprecated") continue
    const cost = model.cost.find((item) => item.tier === undefined) ?? model.cost[0]
    provider.models[model.id] = {
      id: model.id,
      providerID: model.providerID,
      api: {
        id: model.modelID,
        url: "",
        npm: model.package ?? provider.id,
      },
      name: model.name,
      family: model.family,
      capabilities: {
        temperature: false,
        attachment: model.capabilities.input.some((item) => item !== "text"),
        toolcall: model.capabilities.tools,
        input: {
          text: model.capabilities.input.includes("text"),
          audio: model.capabilities.input.includes("audio"),
          image: model.capabilities.input.includes("image"),
          video: model.capabilities.input.includes("video"),
          pdf: model.capabilities.input.includes("pdf"),
        },
        output: {
          text: model.capabilities.output.includes("text"),
          audio: model.capabilities.output.includes("audio"),
          image: model.capabilities.output.includes("image"),
          video: model.capabilities.output.includes("video"),
          pdf: model.capabilities.output.includes("pdf"),
        },
        interleaved: false,
      },
      cost: {
        input: cost?.input ?? 0,
        output: cost?.output ?? 0,
        cache: {
          read: cost?.cache.read ?? 0,
          write: cost?.cache.write ?? 0,
        },
      },
      limit: model.limit,
      status: model.status,
      options: model.settings ?? {},
      headers: model.headers ?? {},
      release_date: new Date(model.time.released).toISOString().slice(0, 10),
      variants: Object.fromEntries(model.variants.map((variant) => [variant.id, variant.settings ?? {}])),
    }
  }

  const result = {
    all,
    connected: providers
      .filter((provider) => provider.activation !== "disabled" && Object.keys(all.get(provider.id)!.models).length > 0)
      .map((provider) => provider.id),
    default: Object.fromEntries(
      providers.flatMap((provider) => {
        const model = models?.find((item) => item.providerID === provider.id && item.status !== "deprecated")
        return model ? [[provider.id, model.id]] : []
      }),
    ),
  }
  if (models) {
    const cache = providerCatalogs.get(providers) ?? new WeakMap<ModelListOutput["data"], ProviderListResponse>()
    cache.set(models, result)
    providerCatalogs.set(providers, cache)
  }
  return result
}
