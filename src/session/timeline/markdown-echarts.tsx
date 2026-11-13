import type { MarkdownCodeBlocks } from "@opencode/session-ui/context/markdown"
import { Button } from "@opencode/ui/button"
import { Select } from "@opencode/ui/select"
import type { EChartsType } from "echarts"
import { createEffect, createUniqueId, getOwner, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import "./markdown-echarts.css"
import { useLanguage } from "@/runtime/i18n/language"
import { parseChartOptions } from "./markdown-echarts-options"
import {
  chartDisplayOption,
  chartLayout,
  chartWidth,
  type ChartSize,
  type ChartProportion,
} from "./markdown-echarts-layout"

const CHART_BLOCKS = { render: new Set(["echarts", "json"]), actions: new Set<string>() }
const TIMELINE_TEXT = '[data-slot="session-message-timeline"] [data-component="text-part"] [data-slot="text-part-body"]'
let loaded: Promise<typeof import("echarts")> | undefined

function loadCharts() {
  return (loaded ??= import("echarts").catch((error) => {
    loaded = undefined
    throw error
  }))
}

export function createMarkdownEcharts(): MarkdownCodeBlocks {
  const owner = getOwner()
  return {
    current: () => CHART_BLOCKS,
    actions: () => [],
    render(target, block, fallback) {
      let disposed = false
      let disposeChart: VoidFunction | undefined

      // Markdown can decorate a detached block. Its text-part ancestors are available after insertion.
      queueMicrotask(() => {
        if (disposed) return
        const wrapper = target.parentElement
        const source = wrapper?.querySelector<HTMLPreElement>(":scope > pre")
        if (!wrapper || !source || !target.closest(TIMELINE_TEXT)) return fallback()
        const result = parseChartOptions(block.code, block.language)
        if (result.kind === "code") return fallback()

        // Keep the controls above the shared source, including while the chart loads or reports an error.
        target.dataset.component = "markdown-echarts"
        wrapper.insertBefore(target, source)
        disposeChart = render(() => <Chart result={result} wrapper={wrapper} source={source} />, target, undefined, {
          owner,
        })
      })
      return () => {
        disposed = true
        disposeChart?.()
      }
    },
  }
}

function Chart(props: {
  result: Exclude<ReturnType<typeof parseChartOptions>, { kind: "code" }>
  wrapper: HTMLElement
  source: HTMLPreElement
}) {
  const language = useLanguage()
  const [state, setState] = createStore({
    ...(props.result.kind === "chart"
      ? chartLayout(props.result.option)
      : { size: "medium" as ChartSize, proportion: "wide" as ChartProportion }),
    ready: false,
    source: false,
    error: props.result.kind === "error" ? props.result.reason : "",
  })
  const id = createUniqueId()
  const previousID = props.source.getAttribute("id")
  props.source.id = id
  let container!: HTMLDivElement
  let library: typeof import("echarts") | undefined
  let instance: EChartsType | undefined
  let resize: ResizeObserver | undefined
  let closed = false

  createEffect(() => {
    props.wrapper.dataset.echartsReady = String(state.ready)
    props.wrapper.dataset.echartsSource = String(state.source)
    props.wrapper.dataset.echartsLayout = String(!state.error && props.result.kind === "chart")
    props.wrapper.style.setProperty("--markdown-chart-width", `${chartWidth(state.size, state.proportion)}px`)
  })

  function draw() {
    if (closed || !library || state.error || props.result.kind !== "chart") return
    if (!container.clientWidth || !container.clientHeight) return
    try {
      if (instance) {
        instance.resize()
        return
      }
      instance = library.init(container, undefined, { renderer: "svg" })
      // Keep the original options untouched so every reset starts from the same input.
      instance.setOption(chartDisplayOption(props.result.option, container.clientWidth, container.clientHeight), {
        notMerge: true,
      })
      setState("ready", true)
    } catch {
      instance?.dispose()
      instance = undefined
      setState({ error: "render", ready: false })
    }
  }

  function reset() {
    if (closed || !instance) return
    // Recreate views too: graph layouts can retain dragged positions across option updates.
    instance.dispose()
    instance = undefined
    draw()
  }

  onMount(() => {
    if (props.result.kind !== "chart") return
    resize = new ResizeObserver(draw)
    resize.observe(container)
    void loadCharts()
      .then((value) => {
        library = value
        draw()
      })
      .catch(() => {
        if (!closed) setState("error", "load")
      })
  })

  onCleanup(() => {
    closed = true
    resize?.disconnect()
    instance?.dispose()
    delete props.wrapper.dataset.echartsReady
    delete props.wrapper.dataset.echartsSource
    delete props.wrapper.dataset.echartsLayout
    props.wrapper.style.removeProperty("--markdown-chart-width")
    if (previousID === null) props.source.removeAttribute("id")
    else props.source.id = previousID
  })

  return (
    <>
      <div class="markdown-echarts-toolbar">
        <Show
          when={state.ready}
          fallback={
            <span role={state.error ? "alert" : "status"}>
              {state.error ? language.t("timeline.chart.error") : language.t("timeline.chart.loading")}
            </span>
          }
        >
          <Button
            size="small"
            variant="ghost"
            aria-expanded={state.source}
            aria-controls={id}
            onClick={() => setState("source", !state.source)}
          >
            {language.t(state.source ? "timeline.chart.hideSource" : "timeline.chart.showSource")}
          </Button>
          <Button size="small" variant="ghost" onClick={reset}>
            {language.t("timeline.chart.reset")}
          </Button>
          <Select<ChartSize>
            aria-label={language.t("timeline.chart.size")}
            options={["small", "medium", "large"]}
            current={state.size}
            label={(value) => language.t(`timeline.chart.size.${value}`)}
            onSelect={(value) => value && setState("size", value)}
          />
          <Select<ChartProportion>
            aria-label={language.t("timeline.chart.proportion")}
            options={["wide", "square"]}
            current={state.proportion}
            label={(value) => language.t(`timeline.chart.proportion.${value}`)}
            onSelect={(value) => value && setState("proportion", value)}
          />
        </Show>
      </div>
      <Show when={!state.error}>
        <div
          ref={container}
          class="markdown-echarts-canvas"
          data-proportion={state.proportion}
          role="img"
          aria-label={language.t("timeline.chart.label")}
        />
      </Show>
    </>
  )
}
