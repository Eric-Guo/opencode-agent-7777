import { describe, expect, test } from "bun:test"
import { parseChartOptions } from "./markdown-echarts-options"

describe("chart option recognition", () => {
  test("recognizes explicit charts and conservatively detects JSON data sources", () => {
    for (const option of [
      { series: { type: "pie", data: [{ name: "A", value: 2 }] } },
      { series: [{ type: "line" }], dataset: { source: [["A", 2]] } },
      { series: [{ type: "graph", nodes: [{ name: "A" }] }] },
    ]) {
      for (const language of ["json", "echarts", "ECHARTS"]) {
        expect<unknown>(parseChartOptions(JSON.stringify(option), language)).toEqual({ kind: "chart", option })
      }
    }
  })

  test("leaves ordinary JSON, other languages and unsupported automatic detections as code", () => {
    for (const source of [
      "{",
      "null",
      "[]",
      "123",
      '{"series":[]}',
      '{"series":{"type":"line"}}',
      '{"series":{"type":"television","data":[]}}',
      '{"series":{"type":{"toString":null},"data":[]}}',
      '{"option":{"series":[{"type":"pie","data":[]}]}}',
    ]) {
      expect(parseChartOptions(source, "json")).toEqual({ kind: "code" })
    }
    expect(parseChartOptions('{"series":{"type":"pie","data":[]}}', "javascript")).toEqual({ kind: "code" })
  })

  test("explicit malformed JSON and unsupported charts produce source-preserving errors", () => {
    for (const source of [
      "{",
      "null",
      "[]",
      "option = {}",
      "{series: []}",
      '{"series":[{"type":"custom","renderItem":()=>{}}]}',
    ]) {
      expect(parseChartOptions(source, "echarts")).toEqual({ kind: "error", reason: "invalid" })
    }
    for (const option of [
      { series: [] },
      { series: { type: "map", map: "world" } },
      { series: { type: "custom", data: [] } },
      { series: { type: "scatter", coordinateSystem: "geo", data: [] } },
      { series: { type: "bar" }, dataset: { transform: { type: "plugin:external" } } },
    ]) {
      expect(parseChartOptions(JSON.stringify(option), "echarts")).toEqual({ kind: "error", reason: "unsupported" })
    }
  })
})

describe("untrusted chart options", () => {
  test("normalizes display options without changing the source or sharing parsed instances", () => {
    const input = {
      title: { text: "<b>Chart</b>", link: "javascript:alert(1)", sublink: "https://example.com" },
      tooltip: {
        renderMode: "html",
        formatter: "{b}: {c}",
        extraCssText: "background: url(https://example.com)",
        appendTo: "body",
      },
      toolbox: {
        feature: { dataView: { title: "<img onerror=alert(1)>" }, saveAsImage: { name: "../file", type: "html" } },
      },
      series: [
        {
          type: "pie",
          data: [{ value: 1, name: "A", link: "javascript:alert(1)", tooltip: { renderMode: "html" } }],
          symbol: "image://https://example.com/a.png",
          markLine: { symbol: ["image://https://example.com/a.png", "arrow"] },
          label: { formatter: "image://this is a label" },
          itemStyle: { color: "url(https://example.com/a.svg)" },
        },
      ],
      graphic: [{ type: "image", style: { image: "https://example.com/a.png" } }],
    }
    const source = JSON.stringify(input)
    const parsed = parseChartOptions(source, "echarts")
    expect<unknown>(parsed).toEqual({
      kind: "chart",
      option: {
        title: { text: "<b>Chart</b>" },
        tooltip: { renderMode: "richText", formatter: "{b}: {c}" },
        toolbox: { feature: { saveAsImage: { name: "chart", type: "png" } } },
        series: [
          {
            type: "pie",
            data: [{ value: 1, name: "A", tooltip: { renderMode: "richText" } }],
            symbol: "none",
            markLine: { symbol: ["none", "arrow"] },
            label: { formatter: "image://this is a label" },
            itemStyle: { color: "none" },
          },
        ],
        graphic: [{ type: "image", style: {} }],
      },
    })
    expect(JSON.stringify(input)).toBe(source)
    if (parsed.kind !== "chart") throw new Error("Expected chart")
    parsed.option.title = { text: "mutated" }
    const next = parseChartOptions(source, "echarts")
    expect(next.kind === "chart" && next.option.title).toEqual({ text: "<b>Chart</b>" })
  })

  test("rejects nested regex dataset filters and removes prototype keys", () => {
    const source = JSON.stringify({
      series: { type: "bar" },
      dataset: { transform: { type: "filter", config: { and: [{ dimension: 0, reg: "(a+)+$" }] } } },
    })
    expect(parseChartOptions(source, "json")).toEqual({ kind: "error", reason: "unsafe" })
    expect(parseChartOptions('{"__proto__":{"polluted":true},"series":{"type":"pie","data":[]}}', "echarts")).toEqual({
      kind: "chart",
      option: { series: { type: "pie", data: [] } },
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
