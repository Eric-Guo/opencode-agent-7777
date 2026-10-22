import type { EChartsOption } from "echarts"

type JsonObject = Record<string, unknown>

const SERIES = new Set([
  "line",
  "bar",
  "pie",
  "scatter",
  "effectScatter",
  "radar",
  "tree",
  "treemap",
  "sunburst",
  "boxplot",
  "candlestick",
  "heatmap",
  "graph",
  "sankey",
  "funnel",
  "gauge",
  "pictorialBar",
  "themeRiver",
  "parallel",
  "lines",
  "chord",
])

export type ChartOptions =
  | { kind: "chart"; option: EChartsOption }
  | { kind: "error"; reason: "invalid" | "unsupported" | "unsafe" }
  | { kind: "code" }

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value]
}

function hasRegex(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRegex)
  return object(value) && (Object.hasOwn(value, "reg") || Object.values(value).some(hasRegex))
}

// Work exclusively on a freshly parsed JSON tree. Never pass message/store objects to ECharts.
function normalize(value: unknown, resource = false): unknown {
  if (resource && typeof value === "string" && (value.startsWith("image://") || /^\s*url\s*\(/i.test(value))) {
    return "none"
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, resource))
  }
  if (!object(value)) return value

  for (const key of Object.keys(value)) {
    const child = value[key]
    if (["__proto__", "constructor", "prototype", "link", "sublink", "href", "image"].includes(key)) {
      delete value[key]
      continue
    }
    value[key] = normalize(child, resource || key === "symbol" || key === "icon" || /(?:color|fill|stroke)$/i.test(key))
    if (key === "tooltip") {
      for (const tooltip of list(child)) {
        if (!object(tooltip)) continue
        tooltip.renderMode = "richText"
        delete tooltip.extraCssText
        delete tooltip.appendTo
      }
    }
    if (key === "toolbox") {
      for (const toolbox of list(child)) {
        if (!object(toolbox) || !object(toolbox.feature)) continue
        delete toolbox.feature.dataView
        const save = toolbox.feature.saveAsImage
        if (object(save)) {
          save.name = "chart"
          save.type = "png"
        }
      }
    }
  }
  return value
}

export function parseChartOptions(source: string, language: string): ChartOptions {
  const explicit = language.toLowerCase() === "echarts"
  if (!explicit && language.toLowerCase() !== "json") return { kind: "code" }

  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return explicit ? { kind: "error", reason: "invalid" } : { kind: "code" }
  }

  if (!object(value)) return explicit ? { kind: "error", reason: "invalid" } : { kind: "code" }
  const series = list(value.series)
  const recognized =
    series.length > 0 && series.every((item) => object(item) && typeof item.type === "string" && SERIES.has(item.type))
  const dataset = list(value.dataset)
  const data =
    dataset.some(object) ||
    series.some((item) => object(item) && (Array.isArray(item.data) || Array.isArray(item.nodes)))

  if (!explicit && (!recognized || !data)) return { kind: "code" }
  if (
    !recognized ||
    value.baseOption ||
    value.options ||
    value.media ||
    value.geo ||
    series.some((item) => object(item) && item.coordinateSystem === "geo")
  ) {
    return { kind: "error", reason: "unsupported" }
  }
  try {
    for (const item of dataset) {
      if (!object(item)) continue
      for (const transform of list(item.transform)) {
        if (hasRegex(transform)) return { kind: "error", reason: "unsafe" }
        if (!object(transform) || (transform.type !== "filter" && transform.type !== "sort")) {
          return { kind: "error", reason: "unsupported" }
        }
      }
    }
    normalize(value)
  } catch {
    // Excessively nested input must not interrupt rendering of the rest of the conversation.
    return { kind: "error", reason: "invalid" }
  }
  // All values come from strict JSON; ECharts validates the remaining option semantics when rendering.
  return { kind: "chart", option: value as EChartsOption }
}
