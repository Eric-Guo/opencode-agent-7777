import { readFile, writeFile } from "node:fs/promises"

type Visibility = "show" | "hide"
type ModelSelection = { providerID: string; modelID: string }
type ModelVisibility = ModelSelection & { visibility: Visibility }
type ProviderVisibility = { providerID: string; visibility: Visibility }
type DefaultModelConfig = {
  manageModels: boolean
  defaultSelection: ModelSelection | null
  disabledProviders: string[]
  popularProviders: ProviderVisibility[]
  user: ModelVisibility[]
}

const MODEL_CONFIG_KEY = "opencode.7777.model.config"
const MODEL_SELECTION_KEY = "opencode.7777.model.selection"
const configFile = new URL("../src/context/default-model-config.json", import.meta.url)

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isVisibility(value: unknown): value is Visibility {
  return value === "show" || value === "hide"
}

function isModelSelection(value: unknown): value is ModelSelection {
  if (!isObject(value)) return false
  return typeof value.providerID === "string" && typeof value.modelID === "string"
}

function isModelVisibility(value: unknown): value is ModelVisibility {
  return isModelSelection(value) && isVisibility(value.visibility)
}

function isProviderVisibility(value: unknown): value is ProviderVisibility {
  if (!isObject(value)) return false
  return typeof value.providerID === "string" && isVisibility(value.visibility)
}

function readOption(name: string) {
  const prefix = `${name}=`
  const value = process.argv.find((arg) => arg.startsWith(prefix))
  return value?.slice(prefix.length)
}

function parseBooleanOption(name: string) {
  const value = readOption(name)
  if (value === undefined) return
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`${name} must be true or false`)
}

function parseDefaultOption() {
  const value = readOption("--default")
  if (!value) return
  const separator = value.indexOf(":")
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error("--default must use providerID:modelID")
  }
  return {
    providerID: value.slice(0, separator),
    modelID: value.slice(separator + 1),
  }
}

async function readStdin() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8").trim()
}

async function main() {
  const raw = await readStdin()
  if (!raw) throw new Error("Paste a JSON localStorage dump into stdin")

  const dump = JSON.parse(raw) as unknown
  const source = isObject(dump) ? dump : {}
  const storedConfig = parseMaybeJson(source.config ?? source[MODEL_CONFIG_KEY] ?? dump)
  const storedSelection = parseMaybeJson(source.selection ?? source[MODEL_SELECTION_KEY])

  if (!isObject(storedConfig)) throw new Error("Dump does not contain a model config object")

  const existing = JSON.parse(await readFile(configFile, "utf8")) as DefaultModelConfig
  const explicitDefault = parseDefaultOption()
  const manageModels = parseBooleanOption("--manage")
  const next: DefaultModelConfig = {
    ...existing,
    manageModels: manageModels ?? existing.manageModels,
    defaultSelection: explicitDefault ?? (isModelSelection(storedSelection) ? storedSelection : existing.defaultSelection),
    disabledProviders: Array.isArray(storedConfig.disabledProviders)
      ? storedConfig.disabledProviders.filter((item): item is string => typeof item === "string")
      : existing.disabledProviders,
    popularProviders: Array.isArray(storedConfig.popularProviders)
      ? storedConfig.popularProviders.filter(isProviderVisibility)
      : existing.popularProviders,
    user: Array.isArray(storedConfig.user) ? storedConfig.user.filter(isModelVisibility) : existing.user,
  }

  await writeFile(configFile, `${JSON.stringify(next, null, 2)}\n`)

  console.log(`Updated ${new URL(configFile).pathname}`)
  console.log(
    `defaultSelection: ${next.defaultSelection ? `${next.defaultSelection.providerID}:${next.defaultSelection.modelID}` : "null"}`,
  )
  console.log(`manageModels: ${next.manageModels}`)
  console.log(`disabledProviders: ${next.disabledProviders.length}`)
  console.log(`popularProviders: ${next.popularProviders.length}`)
  console.log(`user: ${next.user.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
