import { describe, expect, test } from "bun:test"
import type { EChartsOption } from "echarts"
import { chartDisplayOption, chartLayout, type ChartSize, type ChartProportion } from "./markdown-echarts-layout"

describe("chart presentation", () => {
  test("chooses sizes and proportions for the 24 chart examples", () => {
    const cases: [string, Record<string, unknown>[], ChartSize, ChartProportion][] = [
      ["line", [{ type: "line" }], "medium", "wide"],
      ["stacked bars", [{ type: "bar", stack: "total" }], "medium", "wide"],
      ["labeled pie", [{ type: "pie", data: [1, 2, 3, 4, 5] }], "medium", "square"],
      ["radar", [{ type: "radar" }], "medium", "square"],
      ["gauge", [{ type: "gauge" }], "small", "square"],
      ["heatmap", [{ type: "heatmap" }], "large", "wide"],
      ["sankey", [{ type: "sankey" }], "large", "wide"],
      ["force graph", [{ type: "graph", layout: "force" }], "large", "square"],
      ["candlestick with MA", [{ type: "candlestick" }, { type: "line" }], "large", "wide"],
      ["funnel", [{ type: "funnel" }], "medium", "square"],
      ["grouped bars", [{ type: "bar" }, { type: "bar" }], "medium", "wide"],
      ["rose", [{ type: "pie", roseType: "radius" }], "medium", "square"],
      ["completion ring", [{ type: "pie", radius: ["58%", "78%"], data: [735, 265] }], "small", "square"],
      ["scatter", [{ type: "scatter" }], "medium", "wide"],
      ["bubble", [{ type: "scatter", symbolSize: 30 }], "medium", "wide"],
      ["boxplot and outliers", [{ type: "boxplot" }, { type: "scatter" }], "medium", "wide"],
      ["sunburst", [{ type: "sunburst" }], "large", "square"],
      ["tree", [{ type: "tree" }], "large", "wide"],
      ["step area", [{ type: "line", step: "start", areaStyle: {} }], "medium", "wide"],
      ["polar bars", [{ type: "bar", coordinateSystem: "polar" }], "medium", "square"],
      ["pictorial bars", [{ type: "pictorialBar" }], "medium", "wide"],
      ["theme river", [{ type: "themeRiver" }], "large", "wide"],
      ["parallel coordinates", [{ type: "parallel" }], "large", "wide"],
      [
        "Gantt bars",
        [{ type: "bar", stack: "tasks", itemStyle: { color: "transparent" } }, { type: "bar" }],
        "large",
        "wide",
      ],
    ]
    for (const [name, series, size, proportion] of cases) {
      expect(chartLayout({ series } as EChartsOption), name).toEqual({ size, proportion })
    }
  })

  test("gives dense and mixed layouts enough room without relying on titles", () => {
    for (const option of [
      { series: [{ type: "line", data: Array.from({ length: 61 }, (_, i) => i) }] },
      { series: [{ type: "pie" }, { type: "pie" }] },
      { series: [{ type: "gauge" }, { type: "gauge" }] },
      { series: [{ type: "line" }], grid: [{}, {}] },
      { series: [{ type: "graph", coordinateSystem: "cartesian2d" }] },
    ])
      expect(chartLayout(option as EChartsOption)).toEqual({ size: "large", proportion: "wide" })
    expect(chartLayout({ title: { text: "pie" }, series: [{ type: "line" }] })).toEqual({
      size: "medium",
      proportion: "wide",
    })
    expect(chartLayout({ series: [{ type: "tree", layout: "radial" }] })).toEqual({
      size: "large",
      proportion: "square",
    })
  })

  test("repairs missing river axes and colliding controls on a fresh copy only", () => {
    const input: EChartsOption = {
      legend: { bottom: 0 },
      grid: { bottom: "14%" },
      dataZoom: [
        { type: "inside", start: 50 },
        { type: "slider", bottom: 0, start: 50 },
      ],
      series: [{ type: "candlestick", data: [[1, 2, 0, 3]] }],
    }
    const original = JSON.stringify(input)
    const display = chartDisplayOption(input, 1000, 562)
    expect(display.grid).toEqual({ bottom: 100 })
    expect(display.dataZoom).toEqual([
      { type: "inside", start: 50 },
      { type: "slider", bottom: 32, start: 50, height: 24 },
    ])
    expect(JSON.stringify(input)).toBe(original)
    const river: EChartsOption = {
      xAxis: { type: "time" },
      yAxis: {},
      grid: {},
      series: [{ type: "themeRiver", data: [["2026-10-01", 1, "A"]] }],
    }
    const result = chartDisplayOption(river, 1000, 562)
    expect(result.singleAxis).toEqual({ type: "time", left: 56, right: 36, top: 64, bottom: 64 })
    expect(result.xAxis).toBeUndefined()
    expect(river.singleAxis).toBeUndefined()
    expect(river.xAxis).toEqual({ type: "time" })
    const authored = { ...river, singleAxis: { type: "category" as const, top: 80 } }
    expect(chartDisplayOption(authored, 1000, 562)).toEqual(authored)
    expect(chartDisplayOption({ ...input, legend: { top: 0 } }, 1000, 562).dataZoom).toEqual(input.dataZoom)
  })

  test("reserves space for outside sunburst labels while retaining ring proportions and source", () => {
    const input: EChartsOption = {
      series: [
        {
          type: "sunburst",
          radius: [0, "90%"],
          levels: [{ r0: "45%", r: "90%", label: { position: "outside" } }],
          data: [{ name: "A", value: 1 }],
        },
      ],
    }
    const original = JSON.stringify(input)
    expect(chartDisplayOption(input, 680, 680).series).toEqual([
      {
        type: "sunburst",
        radius: [0, "80%"],
        levels: [{ r0: "40%", r: "80%", label: { position: "outside" } }],
        data: [{ name: "A", value: 1 }],
      },
    ])
    expect(JSON.stringify(input)).toBe(original)
  })
})
