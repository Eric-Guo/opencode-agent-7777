import type { ModelCost, ModelInfo, ProviderInfo } from "@opencode/client/promise"

export type FileNode = {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

type Modalities = Record<"text" | "audio" | "image" | "video" | "pdf", boolean>
type Cost = Omit<ModelCost, "tier">

// Keep the catalog adapter's existing view shape while deriving server fields from public client types.
// Unknown reasoning support stays unspecified.
export type Model = Pick<ModelInfo, "id" | "providerID" | "name" | "family" | "limit" | "status"> & {
  api: {
    id: string
    url: string
    npm: string
  }
  capabilities: {
    temperature: boolean
    reasoning?: boolean
    attachment: boolean
    toolcall: boolean
    input: Modalities
    output: Modalities
    interleaved: boolean | { field: "reasoning" | "reasoning_content" | "reasoning_details" }
  }
  cost: Cost & {
    tiers?: (Cost & { tier: NonNullable<ModelCost["tier"]> })[]
    experimentalOver200K?: Cost
  }
  options: Record<string, unknown>
  headers: NonNullable<ModelInfo["headers"]>
  release_date: string
  variants?: Record<string, Record<string, unknown>>
}

export type Provider = Pick<ProviderInfo, "id" | "canonical" | "integrationID" | "name"> & {
  source: "env" | "config" | "custom" | "api"
  env: string[]
  key?: string
  options: Record<string, unknown>
  models: Record<string, Model>
}

export type ProviderListResponse = {
  all: Map<string, Provider>
  default: Record<string, string>
  connected: string[]
}
