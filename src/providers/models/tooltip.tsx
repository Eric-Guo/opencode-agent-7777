import { Show, type Component, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { Model } from "@/runtime/server/types"

type InputKey = "text" | "image" | "audio" | "video" | "pdf"

type ModelInfo = Pick<Model, "id" | "name" | "limit"> & {
  provider: {
    name: string
  }
  capabilities?: Pick<Model["capabilities"], "input"> & {
    reasoning?: boolean
  }
  modalities?: {
    input: Array<string>
  }
  reasoning?: boolean
}

function ModelTooltipRow(props: { name: JSX.Element; value: JSX.Element }) {
  return (
    <div class="flex min-w-0 items-center gap-4">
      <span class="shrink-0 text-v2-text-text-muted">{props.name}</span>
      <span class="ml-auto min-w-0 truncate text-right text-v2-text-text-base">{props.value}</span>
    </div>
  )
}

export const ModelTooltip: Component<{ model: ModelInfo; latest?: boolean; free?: boolean }> = (props) => {
  const language = useLanguage()
  const inputLabel = (value: string) => {
    if (value === "text") return language.t("model.input.text")
    if (value === "image") return language.t("model.input.image")
    if (value === "audio") return language.t("model.input.audio")
    if (value === "video") return language.t("model.input.video")
    if (value === "pdf") return language.t("model.input.pdf")
    return value
  }
  const name = () => {
    const tags: Array<string> = []
    if (props.latest) tags.push(language.t("model.tag.latest"))
    if (props.free) tags.push(language.t("model.tag.free"))
    const suffix = tags.length ? ` (${tags.join(", ")})` : ""
    return `${props.model.name}${suffix}`
  }
  const inputs = () => {
    if (props.model.capabilities) {
      const input = props.model.capabilities.input
      const order: Array<InputKey> = ["text", "image", "audio", "video", "pdf"]
      const entries = order.filter((key) => input.includes(key)).map((key) => inputLabel(key))
      return entries.length ? entries.join(", ") : undefined
    }
    const raw = props.model.modalities?.input
    if (!raw) return
    const entries = raw.map((value) => inputLabel(value))
    return entries.length ? entries.join(", ") : undefined
  }
  const reasoning = () => {
    // The direct client only reports input/output modalities; omit reasoning when it is unknown.
    const value = props.model.capabilities?.reasoning ?? props.model.reasoning
    if (value === undefined) return
    return value ? language.t("model.tooltip.reasoning.allowed") : language.t("model.tooltip.reasoning.none")
  }
  const contextLimit = () => props.model.limit.context.toLocaleString(language.intl())

  return (
    <div class="flex w-[180px] flex-col gap-2">
      <ModelTooltipRow name={language.t("model.tooltip.model")} value={name()} />
      <ModelTooltipRow name={language.t("model.tooltip.provider")} value={props.model.provider.name} />
      <Show when={inputs()}>
        {(value) => <ModelTooltipRow name={language.t("model.tooltip.inputs")} value={value()} />}
      </Show>
      <Show when={reasoning()}>
        {(value) => <ModelTooltipRow name={language.t("model.tooltip.reasoning")} value={value()} />}
      </Show>
      <ModelTooltipRow name={language.t("model.tooltip.context.label")} value={contextLimit()} />
    </div>
  )
}
