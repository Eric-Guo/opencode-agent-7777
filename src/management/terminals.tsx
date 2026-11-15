import { For, Show, onMount, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { Terminal } from "@xterm/xterm"
import type { TaskDetail } from "@cybros/agent"
import type { ManagementClient } from "./client"
import { request, RequestError } from "../nexus/controller"
import { FieldRow } from "./fields"
import { terminalConnection } from "./terminal-connection"
import "@xterm/xterm/css/xterm.css"

type Target = { run: string; task: string }

type Row = Target & { status: string; created: string | null }

type TerminalDetail = TaskDetail & { writable?: boolean }

export function Terminals(props: { client: ManagementClient; target?: Target }) {
  const c = props.client

  const [s, set] = createStore({
    rows: [] as Row[],
    next: null as string | null,
    target: props.target ?? (null as Target | null),
    runner: c.chat.s.connection?.runner ?? "",
    key: crypto.randomUUID(),
  })

  const refresh = async (after?: string) => {
    const page = await request<{ items: Row[]; next: string | null }>(
      "/terminals" + (after ? "?after=" + encodeURIComponent(after) : ""),
      c.scope(),
    )

    set({ rows: after ? [...s.rows, ...page.items] : page.items, next: page.next })
  }

  onMount(() => void c.perform(() => refresh()))

  return (
    <section>
      <h2>Terminals</h2>
      <p>A terminal runs on its selected runner. Closing this page detaches the viewer; Stop ends the shell.</p>
      <div class="nexus-card">
        <FieldRow label="Runner">
          <select value={s.runner} onChange={(e) => set("runner", e.currentTarget.value)}>
            <option value="">Choose runner</option>
            <For each={c.chat.s.choices?.runners}>{(row) => <option value={row.id}>{row.name}</option>}</For>
          </select>
        </FieldRow>
        <div class="nexus-actions">
          <Button
            disabled={c.state.busy || !s.runner}
            onClick={() =>
              void c.perform(async () => {
                const target = await request<Target>("/terminals", c.scope(), {
                  action: "create",
                  runner: s.runner,
                  key: s.key,
                })

                set({ target, key: crypto.randomUUID() })
                await refresh()
              })
            }
          >
            New terminal
          </Button>
          <Button onClick={() => void c.perform(() => refresh())}>Refresh</Button>
        </div>
        <For each={s.rows}>
          {(row) => (
            <div class="nexus-actions">
              <span>
                {row.created ? new Date(row.created).toLocaleString() : row.run} · {row.status}
              </span>
              <Button onClick={() => set("target", { run: row.run, task: row.task })}>Attach</Button>
            </div>
          )}
        </For>
        <Show when={s.next}>
          <Button onClick={() => void c.perform(() => refresh(s.next!))}>Load older terminals</Button>
        </Show>
      </div>
      <Show when={s.target} keyed>
        {(target) => <TerminalSession client={c} target={target} />}
      </Show>
    </section>
  )
}

function TerminalSession(props: { client: ManagementClient; target: Target }) {
  const [s, set] = createStore({
    detail: null as TerminalDetail | null,
    status: "Connecting",
    error: "",
  })
  const abort = new AbortController()
  const scope = props.client.scope()

  const call = <T,>(action: string, input = {}) =>
    request<T>("/terminals", scope, { ...props.target, action, ...input }, abort.signal)

  let element!: HTMLDivElement
  let screen: Terminal | undefined
  let connection: ReturnType<typeof terminalConnection> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let observer: ResizeObserver | undefined

  const detach = () => {
    connection?.close()
    connection = undefined
    observer?.disconnect()
    observer = undefined
    screen?.dispose()
    screen = undefined
  }

  const poll = async () => {
    try {
      const detail = await call<TerminalDetail>("read")

      if (abort.signal.aborted) return
      set("detail", detail)

      if (["completed", "failed", "canceled", "cancelled", "stopped"].includes(detail.task.status)) {
        connection?.close()
        set("status", detail.task.status)

        return
      }

      if (detail.writable === false) {
        detach()
        set("status", "Read-only terminal")
      }

      if (detail.writable !== false && ["running", "dispatched"].includes(detail.task.status) && !connection) {
        const { Terminal } = await import("@xterm/xterm")

        const settings = await request<{ iceServers: RTCIceServer[] }>(
          "/terminals/config",
          scope,
          undefined,
          abort.signal,
        )

        if (abort.signal.aborted) return
        screen = new Terminal({ cursorBlink: true, convertEol: false, fontSize: 13, rows: 24, cols: 80 })
        screen.open(element)
        connection = terminalConnection({
          call,
          signal: abort.signal,
          iceServers: settings.iceServers,
          status: (status) => set("status", status),
          output: (bytes) => new Promise((resolve) => screen!.write(bytes, resolve)),
        })
        screen.onData((text) => {
          if (!connection!.send(text))
            set("error", "Input was not sent. Wait for the terminal to reconnect before typing again.")
        })
        observer = new ResizeObserver(() => {
          const cols = Math.max(2, Math.min(500, Math.floor(element.clientWidth / 8)))
          screen!.resize(cols, 24)
          connection!.resize(cols, 24)
        })
        observer.observe(element)
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        if (error instanceof RequestError && [401, 403, 404].includes(error.status)) {
          detach()

          if (s.detail) set("detail", { ...s.detail, writable: false })
          set("status", "Terminal unavailable")
          set("error", error.message)

          return
        }

        set("error", error instanceof Error ? error.message : String(error))
      }
    }

    if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 1000)
  }

  onMount(() => void poll())
  onCleanup(() => {
    abort.abort()
    clearTimeout(timer)
    detach()
  })

  return (
    <div class="nexus-card">
      <p role="status">
        {s.detail?.writable !== false && s.detail?.task.status === "needs_approval"
          ? "Terminal requires approval"
          : s.status}
      </p>
      <Show when={s.error}>
        <p role="alert" class="nexus-error">
          {s.error}
        </p>
      </Show>
      <div class="nexus-actions">
        <Show when={s.detail?.task.status === "needs_approval"}>
          <Button
            disabled={props.client.state.busy || s.detail?.writable === false}
            onClick={() => void props.client.perform(() => call("approve"))}
          >
            Approve terminal
          </Button>
        </Show>
        <Button
          disabled={props.client.state.busy || !s.detail || s.detail.writable === false}
          onClick={() =>
            void props.client.perform(async () => {
              await call("stop")
              connection?.close()
              set("status", "Stopped")
            })
          }
        >
          Stop terminal
        </Button>
      </div>
      <div ref={element} style={{ "min-height": "330px", overflow: "hidden" }} />
    </div>
  )
}
