import { Button } from "@opencode/ui/button"
import type { EChartsType } from "echarts"
import { createEffect, createUniqueId, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import "./markdown-echarts.css"
import { useLanguage } from "@/runtime/i18n/language"
import { parseChartOptions } from "./markdown-echarts-options"

const CODE = '[data-component="text-part"] [data-slot="text-part-body"] [data-component="markdown"] pre > code'
const OWNED = '[data-component="markdown-echarts"]'
let loaded: Promise<typeof import("echarts")> | undefined

function loadCharts() {
  return (loaded ??= import("echarts").catch((error) => {
    loaded = undefined
    throw error
  }))
}

type Entry = { source: string; language: string; complete: boolean; dispose?: () => void }

/** Enhances shared Markdown DOM without taking ownership of its source nodes. */
export function useMarkdownEcharts(root: () => HTMLDivElement) {
  const language = useLanguage()
  const entries = new Map<HTMLElement, Entry>()
  const pending = new Set<HTMLElement>()
  let frame: number | undefined
  let stopped = false
  let observer: MutationObserver | undefined

  function update(code: HTMLElement) {
    if (!root().contains(code) || !code.matches(CODE)) return
    const wrapper = code.closest<HTMLElement>('[data-component="markdown-code"]')
    const markdown = code.closest<HTMLElement>('[data-component="markdown"]')
    if (!wrapper || !markdown) return
    const block = code.closest<HTMLElement>("[data-markdown-block]")
    const complete =
      block?.dataset.markdownComplete === "true" ||
      (!markdown.hasAttribute("data-streaming") && markdown.hasAttribute("data-markdown-ready"))
    const source = code.textContent ?? ""
    const fence = wrapper.dataset.language?.toLowerCase() ?? ""
    const previous = entries.get(code)
    if (previous?.source === source && previous.language === fence && previous.complete === complete) return
    previous?.dispose?.()
    const entry: Entry = { source, language: fence, complete }
    entries.set(code, entry)
    if (!complete) return
    const result = parseChartOptions(source, fence)
    if (result.kind === "code") return

    const host = document.createElement("div")
    host.dataset.component = "markdown-echarts"
    wrapper.prepend(host)
    const dispose = render(
      () => (
        <Chart
          result={result}
          wrapper={wrapper}
          language={language}
          current={() =>
            !stopped &&
            entries.get(code) === entry &&
            root().contains(code) &&
            host.parentElement === wrapper &&
            code.textContent === source &&
            wrapper.dataset.language?.toLowerCase() === fence
          }
        />
      ),
      host,
    )
    entry.dispose = () => {
      dispose()
      host.remove()
      delete wrapper.dataset.echartsReady
      delete wrapper.dataset.echartsSource
    }
  }

  function collect(node: Node) {
    const element = node instanceof Element ? node : node.parentElement
    if (!element || element.closest(OWNED)) return
    const code = element.closest<HTMLElement>("pre > code")
    if (code) pending.add(code)
    element.querySelectorAll<HTMLElement>(CODE).forEach((code) => pending.add(code))
  }

  function flush() {
    frame = undefined
    for (const [code, entry] of entries) {
      if (root().contains(code) && code.matches(CODE)) continue
      entry.dispose?.()
      entries.delete(code)
    }
    const codes = [...pending]
    pending.clear()
    codes.forEach(update)
  }

  onMount(() => {
    observer = new MutationObserver((records) => {
      let changed = false
      for (const record of records) {
        const element = record.target instanceof Element ? record.target : record.target.parentElement
        if (element?.closest(OWNED)) continue
        if (record.type === "childList") {
          // Ignore our own host insertion/removal and shared copy-button label changes.
          const nodes = [...record.addedNodes, ...record.removedNodes]
          if (nodes.length && nodes.every((node) => node instanceof Element && node.matches(OWNED))) continue
          if (element?.closest('[data-slot="markdown-copy-button"]')) continue
          changed = true
          if (element?.closest("pre > code")) collect(record.target)
          record.addedNodes.forEach(collect)
        } else {
          changed = true
          collect(record.target)
        }
      }
      if (changed && frame === undefined) frame = requestAnimationFrame(flush)
    })
    observer.observe(root(), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-language", "data-markdown-complete", "data-streaming", "data-markdown-ready"],
    })
    collect(root())
    flush()
  })

  onCleanup(() => {
    stopped = true
    observer?.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    entries.forEach((entry) => entry.dispose?.())
    entries.clear()
    pending.clear()
  })
}

function Chart(props: {
  result: Exclude<ReturnType<typeof parseChartOptions>, { kind: "code" }>
  wrapper: HTMLElement
  language: ReturnType<typeof useLanguage>
  current: () => boolean
}) {
  const [state, setState] = createStore({
    ready: false,
    source: false,
    error: props.result.kind === "error" ? props.result.reason : "",
  })
  const id = createUniqueId()
  const source = props.wrapper.querySelector("pre")
  const previousID = source?.getAttribute("id")
  source?.setAttribute("id", id)
  let container!: HTMLDivElement
  let instance: EChartsType | undefined
  let resize: ResizeObserver | undefined
  let closed = false

  createEffect(() => {
    props.wrapper.dataset.echartsReady = String(state.ready)
    props.wrapper.dataset.echartsSource = String(state.source)
  })

  onMount(() => {
    if (props.result.kind !== "chart") return
    const option = props.result.option
    let library: typeof import("echarts") | undefined
    const draw = () => {
      if (closed || !props.current() || !library || state.error) return
      if (!container.clientWidth || !container.clientHeight) return
      try {
        if (instance) {
          instance.resize()
          return
        }
        instance = library.init(container, undefined, { renderer: "svg" })
        instance.setOption(option, { notMerge: true })
        setState("ready", true)
      } catch {
        instance?.dispose()
        instance = undefined
        setState({ error: "render", ready: false })
      }
    }
    resize = new ResizeObserver(draw)
    resize.observe(container)
    void loadCharts()
      .then((value) => {
        library = value
        draw()
      })
      .catch(() => {
        if (!closed && props.current()) setState("error", "load")
      })
  })

  onCleanup(() => {
    closed = true
    resize?.disconnect()
    instance?.dispose()
    if (previousID === null) source?.removeAttribute("id")
    else if (previousID !== undefined) source?.setAttribute("id", previousID)
  })

  return (
    <>
      <div class="markdown-echarts-toolbar">
        <Show
          when={state.ready}
          fallback={
            <span role={state.error ? "alert" : "status"}>
              {state.error ? props.language.t("timeline.chart.error") : props.language.t("timeline.chart.loading")}
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
            {props.language.t(state.source ? "timeline.chart.hideSource" : "timeline.chart.showSource")}
          </Button>
        </Show>
      </div>
      <Show when={!state.error}>
        <div
          ref={container}
          class="markdown-echarts-canvas"
          role="img"
          aria-label={props.language.t("timeline.chart.label")}
        />
      </Show>
    </>
  )
}
