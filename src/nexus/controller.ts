import { createStore, reconcile } from "solid-js/store"
import { storageGet, storageSet } from "../runtime/persistence/storage"
import { updateLive, type Connection, type Frame, type Resolution, type Snapshot } from "./chat"

const root = "/api/7777"
export async function request<T>(path: string, scope?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(root + path, {
    signal,
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(scope ? { "x-7777-scope": encodeURIComponent(scope) } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}
type Attempt = { text: string; model: string; runner: string | null; createKey: string; inputKey: string }
type Saved = { id: string; text: string; attempt?: Attempt }
const empty = (): Snapshot => ({ turns: [], pending: [], busy: false, problem: null, decisions: [] })
export function createChatController(
  api = request,
  openEvents = (url: string) => new EventSource(url),
  storage = { getItem: storageGet, setItem: storageSet },
) {
  const [s, set] = createStore({
    connection: undefined as Connection | undefined,
    id: "",
    draft: "",
    snapshot: empty(),
    live: {} as Record<string, string>,
    connected: false,
    connecting: true,
    sending: false,
    error: "",
    streamError: "",
  })
  let version = 0
  let source: EventSource | undefined
  let attempt: Attempt | undefined
  let streamReady: Promise<void> | undefined
  let invalidate: ReturnType<typeof setTimeout> | undefined
  let refreshJob: Promise<void> | undefined
  let dirty = false
  const fail = (err: unknown) => set("error", err instanceof Error ? err.message : String(err))
  const storageKey = () => "7777.nexus." + s.connection?.scope
  const persist = () => {
    if (s.connection) storage.setItem(storageKey(), JSON.stringify({ id: s.id, text: s.draft, attempt }))
  }
  const path = () => "/chats/" + encodeURIComponent(s.id)
  function clearStream() {
    version++
    clearTimeout(invalidate)
    invalidate = undefined
    source?.close()
    source = undefined
    streamReady = undefined
    refreshJob = undefined
    dirty = false
  }
  function refresh() {
    if (!s.id) return Promise.resolve()
    dirty = true
    if (refreshJob) return refreshJob
    const owner = version
    refreshJob = (async () => {
      try {
        do {
          dirty = false
          const data = await api<Snapshot>(path(), s.connection!.scope)
          if (owner !== version) return
          set("snapshot", reconcile(data, { key: "id" }))
        } while (dirty)
      } catch (err) {
        if (owner === version) fail(err)
      } finally {
        if (owner === version) refreshJob = undefined
      }
    })()
    return refreshJob
  }
  function follow(id: string) {
    clearStream()
    const owner = version
    set({ id, snapshot: empty(), connected: false, streamError: "", live: {} })
    if (!id) return
    const events = openEvents(root + path() + "/stream?scope=" + encodeURIComponent(s.connection!.scope))
    source = events
    streamReady = new Promise<void>((resolve) => {
      events.addEventListener("ready", () => {
        if (owner !== version) return
        set({ connected: true, streamError: "", live: {} })
        void refresh()
        resolve()
      })
    })
    events.addEventListener("frame", (event) => {
      if (owner !== version) return
      const frame: Frame = JSON.parse((event as MessageEvent).data)
      const live = { ...s.live }
      updateLive(live, frame)
      set("live", reconcile(live))
      if (frame.turn) {
        const index = s.snapshot.turns.findIndex(
          (t) => t.id === frame.turn!.id && t.variant === frame.variant_public_id,
        )
        if (index >= 0) set("snapshot", "turns", index, frame.turn)
        void refresh()
      }
    })
    events.addEventListener("refresh", () => {
      if (owner !== version || invalidate !== undefined) return
      // Several lifecycle events can describe one materialization. Read the resulting state once.
      invalidate = setTimeout(() => {
        invalidate = undefined
        void refresh()
      }, 45)
    })
    events.onerror = () => {
      if (owner === version) set({ connected: false, streamError: "Live connection interrupted. Reconnecting…" })
    }
    void refresh()
  }
  async function connect() {
    if (s.sending) return
    clearStream()
    const owner = version
    set({
      connecting: true,
      error: "",
      connected: false,
      streamError: "",
      connection: undefined,
      id: "",
      draft: "",
      snapshot: empty(),
      live: {},
    })
    try {
      const c = await api<Connection>("/connection")
      if (owner !== version) return
      set("connection", c)
      let saved: Partial<Saved> = {}
      try {
        saved = JSON.parse(storage.getItem(storageKey()) || "{}") ?? {}
      } catch {
        /* Empty draft after invalid local storage. */
      }
      attempt = saved.attempt
      set("draft", saved.text ?? "")
      follow(saved.id ?? "")
      set("connecting", false)
    } catch (err) {
      if (owner === version) fail(err)
    } finally {
      if (owner === version) set("connecting", false)
    }
  }
  function select(id: string) {
    if (s.sending) return
    set({ draft: "", error: "" })
    attempt = undefined
    follow(id)
    persist()
  }
  function edit(text: string) {
    if (s.sending || s.draft === text) return
    attempt = undefined
    set("draft", text)
    persist()
  }
  async function send() {
    const c = s.connection
    if (!c || s.sending || s.snapshot.busy || !s.draft.trim()) return
    set({ sending: true, error: "" })
    attempt ??= {
      text: s.draft,
      model: c.model,
      runner: c.runner,
      createKey: crypto.randomUUID(),
      inputKey: crypto.randomUUID(),
    }
    const submission = attempt
    persist()
    try {
      if (!s.id) {
        const created = await api<{ id: string }>("/chats", c.scope, {
          title: submission.text.trim().slice(0, 80),
          runner: submission.runner,
          key: submission.createKey,
        })
        if (c.scope !== s.connection?.scope) return
        follow(created.id)
        persist()
      }
      if (!s.connected) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            streamReady,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Live connection unavailable. Retry your message.")), 8000)
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
        if (!s.connected) throw new Error("Live connection unavailable. Retry your message.")
      }
      await api(path() + "/inputs", c.scope, {
        key: submission.inputKey,
        text: submission.text,
        model: submission.model,
      })
      attempt = undefined
      set("draft", "")
      persist()
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      set("sending", false)
    }
  }
  async function command(action: string, body: unknown) {
    if (!s.connection || !s.id || s.sending) return
    set({ sending: true, error: "" })
    try {
      await api(path() + "/" + action, s.connection.scope, body)
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      set("sending", false)
    }
  }
  return {
    s,
    connect,
    select,
    edit,
    send,
    close: clearStream,
    stop: () => command("stop", {}),
    decide: (run: string, key: string, response: Resolution) => command("decisions", { run, key, response }),
  }
}
