import type { EChartsOption } from "echarts"

export type ChartSize = "small" | "medium" | "large"
export type ChartProportion = "wide" | "square"

const WIDTHS = {
  small: { wide: 640, square: 420 },
  medium: { wide: 840, square: 560 },
  large: { wide: 1000, square: 680 },
} as const

function objects(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
  )
}

export function chartWidth(size: ChartSize, proportion: ChartProportion) {
  return WIDTHS[size][proportion]
}

/** Choose a starting viewport from the chart's structure, never its title or message text. */
export function chartLayout(option: EChartsOption): { size: ChartSize; proportion: ChartProportion } {
  const series = objects(option.series)
  let rank = 0
  const square =
    series.length > 0 &&
    series.every((item) => {
      if (item.coordinateSystem === "polar" || (item.type === "tree" && item.layout === "radial")) return true
      if (item.type === "graph") return !item.coordinateSystem || item.coordinateSystem === "view"
      return ["pie", "gauge", "radar", "sunburst", "funnel", "chord"].includes(String(item.type))
    })
  for (const item of series) {
    let required = 1
    if (["pie", "gauge"].includes(String(item.type))) required = 0
    if (item.type === "pie" && (item.roseType || (Array.isArray(item.data) && item.data.length > 3))) required = 1
    if (item.type === "pie" && Array.isArray(item.data) && item.data.length > 12) required = 2
    if (
      [
        "heatmap",
        "sankey",
        "graph",
        "tree",
        "treemap",
        "sunburst",
        "candlestick",
        "themeRiver",
        "parallel",
        "chord",
      ].includes(String(item.type))
    )
      required = 2
    if (item.type === "bar" && item.stack && objects(item.itemStyle).some((style) => style.color === "transparent"))
      required = 2
    if (Array.isArray(item.data) && item.data.length > 60) required = 2
    rank = Math.max(rank, required)
  }
  // Multiple independently positioned circular plots need space side by side.
  const multipleCircles = series.length > 1 && series.every((item) => item.type === "pie" || item.type === "gauge")
  if (multipleCircles || series.length > 4 || objects(option.grid).length > 1) rank = 2
  return {
    size: (["small", "medium", "large"] as const)[rank]!,
    proportion: square && !multipleCircles ? "square" : "wide",
  }
}

/** Display-only repairs for common generated options; stored and copied JSON stays untouched. */
export function chartDisplayOption(option: EChartsOption, width: number, height: number): EChartsOption {
  const display = structuredClone(option)
  const series = objects(display.series)
  for (const item of series) {
    if (item.type !== "sunburst") continue
    const levels = objects(item.levels)
    const outside = [item, ...levels].some((level) =>
      objects(level.label).some((label) => label.position === "outside"),
    )
    if (!outside) continue
    const percentage = (value: unknown) =>
      typeof value === "string" && value.endsWith("%") ? Number.parseFloat(value) : 0
    const radii = Array.isArray(item.radius) ? item.radius : [0, item.radius ?? "75%"]
    const outer = Math.max(...radii.map(percentage), ...levels.map((level) => percentage(level.r)))
    // Leave room for outside ring labels, including on narrow embedded panes.
    const limit = Math.min(80, Math.max(40, 100 - 8800 / Math.min(width, height)))
    if (outer <= limit) continue
    const fit = (value: unknown) => (percentage(value) ? `${(percentage(value) * limit) / outer}%` : value)
    item.radius = radii.map(fit)
    for (const level of levels) {
      if (level.r !== undefined) level.r = fit(level.r)
      if (level.r0 !== undefined) level.r0 = fit(level.r0)
    }
  }
  if (series.length && series.every((item) => item.type === "themeRiver") && !display.singleAxis) {
    display.singleAxis = { type: "time", left: 56, right: 36, top: 64, bottom: 64 }
    // Theme rivers use singleAxis, not the unused Cartesian components often generated with them.
    delete display.xAxis
    delete display.yAxis
    delete display.grid
  }

  const atBottom = (item: Record<string, unknown>) =>
    item.show !== false &&
    item.top == null &&
    (item.bottom == null || [0, "0", "0%"].includes(item.bottom as string | number))
  const bottomLegend = objects(display.legend).some((item) => atBottom(item) && item.orient !== "vertical")
  let movedSlider = false
  for (const slider of objects(display.dataZoom)) {
    if (!bottomLegend || slider.type !== "slider" || slider.orient === "vertical" || !atBottom(slider)) continue
    slider.bottom = 32
    slider.height ??= 24
    movedSlider = true
  }
  if (movedSlider) {
    for (const grid of objects(display.grid)) {
      const bottom =
        typeof grid.bottom === "string" && grid.bottom.endsWith("%")
          ? (Number.parseFloat(grid.bottom) * height) / 100
          : Number(grid.bottom ?? 60)
      grid.bottom = Math.max(Number.isFinite(bottom) ? bottom : 60, 100)
    }
  }
  return display
}
