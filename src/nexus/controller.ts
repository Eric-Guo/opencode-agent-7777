import { createStore, reconcile } from "solid-js/store"
import { storageGet, storageRemove, storageSet } from "../runtime/persistence/storage"
import type { TurnPage } from "@cybros/agent"
import { uuid } from "@opencode/util/uuid"
import { readFollowUpBehavior } from "../runtime/persistence/settings-storage-compact"
import {
  updateLive,
  projectTurn,
  HISTORY_PAGE_SIZE,
  type Choices,
  type ConversationAction,
  type ConversationTarget,
  type ModeValues,
  type ConversationModes,
  type Approval,
  type Delivery,
  type Connection,
  type Frame,
  type Resolution,
  type Snapshot,
} from "./chat"

const root = "/api/7777"

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

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

  if (!res.ok) throw new RequestError(res.status, data.error || res.statusText)

  return data
}

type Attempt = {
  text: string
  model: string | null
  clearModel?: true
  delivery?: Delivery
  approval?: Approval
  target?: string
  runner: string | null
  createKey: string
  inputKey: string
  initialModes?: ModeValues
  initializingModes?: boolean
  ticket?: string
}
type Saved = {
  id: string
  text: string
  attempt?: Attempt
  draftModes?: Partial<ModeValues>
  model?: string
  modelEdited?: boolean
  runner?: string | null
  runnerEdited?: boolean
  approval?: Approval
}
export type ChatController = ReturnType<typeof createChatController>
const empty = (): Snapshot => ({ turns: [], pending: [], busy: false, problem: null, decisions: [] })
export function createChatController(
  api = request,
  openEvents = (url: string) => new EventSource(url),
  storage: Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">> = {
    getItem: storageGet,
    setItem: storageSet,
    removeItem: storageRemove,
  },
) {
  const [s, set] = createStore({
    connection: undefined as Connection | undefined,
    choices: undefined as Choices | undefined,
    draftModes: {} as Partial<ModeValues>,
    savedModes: undefined as ConversationModes | null | undefined,
    model: "",
    runner: null as string | null,
    approval: "ask" as Approval,
    revision: 0,
    hydrated: false,
    accessDenied: false,
    id: "",
    draft: "",
    snapshot: empty(),
    live: {} as Record<string, string>,
    connected: false,
    connecting: true,
    sending: false,
    submitting: false,
    prepared: false,
    loadingHistory: false,
    hasOlder: true,
    error: "",
    streamError: "",
  })
  let choicesReady: Promise<void> | undefined
  let modeRead = 0
  let choicesRead = 0
  let modelEdited = false
  let runnerEdited = false
  let version = 0
  let source: EventSource | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let attempt: Attempt | undefined
  let streamReady: Promise<void> | undefined
  let invalidate: ReturnType<typeof setTimeout> | undefined
  let refreshJob: Promise<void> | undefined
  let dirty = false
  const fail = (err: unknown) => set("error", err instanceof Error ? err.message : String(err))
  const storageKey = () => "7777.nexus." + s.connection?.scope
  const persist = () => {
    if (!s.connection) return
    const entry = {
      text: s.draft,
      attempt,
      model: s.model,
      modelEdited,
      runner: s.runner,
      runnerEdited,
      approval: s.approval,
      draftModes: !s.id ? s.draftModes : undefined,
    }
    storage.setItem(storageKey() + ".draft." + s.id, JSON.stringify(entry))
    storage.setItem(storageKey(), JSON.stringify({ id: s.id }))
  }
  function savedDraft(id: string, legacy: Partial<Saved> = {}): Partial<Saved> {
    try {
      return JSON.parse(storage.getItem(storageKey() + ".draft." + id) || "null") ?? legacy
    } catch {
      return legacy
    }
  }
  function restore(id: string, legacy: Partial<Saved> = {}) {
    const entry = savedDraft(id, legacy)
    attempt = entry.attempt
    modelEdited = entry.modelEdited ?? !!entry.model
    runnerEdited = entry.runnerEdited ?? (!!entry.runner && entry.runner !== s.connection?.runner)
    set("draftModes", reconcile(!id ? (entry.draftModes ?? {}) : {}))
    const approval = entry.approval ?? "ask"
    set({
      prepared: !!attempt && attempt.text === entry.text,
      draft: entry.text ?? "",
      model: entry.model ?? "",
      runner: attempt ? attempt.runner : (entry.runner ?? null),
      approval:
        !attempt && s.choices && !s.choices.approvals.includes(approval)
          ? (s.choices.approvals[0] ?? "rules")
          : approval,
    })
  }
  function configure(value: { model?: string; runner?: string | null; approval?: Approval }) {
    if (s.sending || s.prepared) return
    attempt = undefined
    if ("model" in value) modelEdited = true
    if ("runner" in value) runnerEdited = true
    set(value)
    persist()
  }
  const path = () => "/chats/" + encodeURIComponent(s.id)
  function clearStream() {
    version++
    clearInterval(poll)
    poll = undefined
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
          if (s.snapshot.expanded) {
            data.turns = [
              ...s.snapshot.turns.filter((turn) => turn.position < (data.turns[0]?.position ?? Infinity)),
              ...data.turns,
            ]
            data.expanded = true
          } else set("hasOlder", data.hasOlder ?? true)
          if (!modelEdited && !attempt)
            set("model", data.turns.findLast((turn) => turn.responseModel)?.responseModel?.selected ?? "")
          set("snapshot", reconcile(data, { key: "id" }))
          set({ hydrated: true, accessDenied: false })
          set("revision", (n) => n + 1)
        } while (dirty)
      } catch (err) {
        if (owner === version) {
          if (err instanceof RequestError && [401, 403, 404].includes(err.status)) {
            set({ hydrated: false, accessDenied: true, connected: false })
            clearInterval(poll)
            poll = undefined
            source?.close()
            source = undefined
          }

          fail(err)
        }
      } finally {
        if (owner === version) refreshJob = undefined
      }
    })()
    return refreshJob
  }
  function follow(id: string) {
    clearStream()
    const owner = version
    set({
      hasOlder: true,
      loadingHistory: false,
      savedModes: undefined,
      id,
      hydrated: !id,
      accessDenied: false,
      snapshot: empty(),
      connected: false,
      streamError: "",
      live: {},
    })
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
      if (owner === version) {
        set({ connected: false, streamError: "Live connection interrupted. Reconnecting…" })
        void refresh()
      }
    }

    // Metadata edits and missed realtime events still recover from authoritative HTTP reads.
    poll = setInterval(() => void refresh(), 3000)
    void refresh()
  }

  function loadChoices(c: Connection) {
    const read = ++choicesRead
    set("choices", undefined)
    choicesReady = api<Choices>("/choices", c.scope)
      .then((choices) => {
        if (read !== choicesRead || s.connection?.scope !== c.scope || !Array.isArray(choices.models)) return
        set("choices", choices)
        if (!s.id && !attempt) {
          const selected = runnerEdited ? s.runner : choices.defaultRunner
          set("runner", choices.runners.find((r) => r.id === selected)?.id ?? null)
        }

        if (!attempt && !choices.approvals.includes(s.approval)) set("approval", choices.approvals[0] ?? "rules")
      })
      .catch((err) => {
        if (read === choicesRead && s.connection?.scope === c.scope) fail(err)
      })
  }

  async function connect(workspace?: string, conversation?: string) {
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
      const c = await api<Connection>("/connection" + (workspace ? "?workspace=" + encodeURIComponent(workspace) : ""))
      if (owner !== version) return
      set("connection", c)
      let saved: Partial<Saved> = {}
      try {
        saved = JSON.parse(storage.getItem(storageKey()) || "{}") ?? {}
      } catch {
        /* Empty draft after invalid local storage. */
      }
      set("choices", undefined)
      restore(conversation ?? saved.id ?? "", saved)
      loadChoices(c)
      follow(conversation ?? saved.id ?? "")
      set("connecting", false)
    } catch (err) {
      if (owner === version) fail(err)
    } finally {
      if (owner === version) set("connecting", false)
    }
  }
  function select(id: string) {
    if (s.sending) return
    persist()
    openSelection(id)
  }
  function openSelection(id: string) {
    set("error", "")
    restore(id)

    if (!id && s.connection) loadChoices(s.connection)
    follow(id)
    persist()
  }
  async function manageSession(target: ConversationTarget, action: ConversationAction, body: object = {}) {
    if (s.connection?.scope !== target.scope || s.sending || (target.id === s.id && !manageable())) return false
    set("sending", true)
    try {
      await api(`/chats/${encodeURIComponent(target.id)}/${action}`, target.scope, body, AbortSignal.timeout(15_000))
      if (action === "delete") storage.removeItem?.(`7777.nexus.${target.scope}.draft.${target.id}`)
      if (s.connection?.scope === target.scope && s.id === target.id) {
        if (action === "delete") openSelection("")
        else await refresh()
      }
      return true
    } finally {
      set("sending", false)
    }
  }
  function edit(text: string) {
    if ((s.sending && !s.submitting) || s.draft === text) return
    if (!s.sending && s.prepared) attempt = undefined
    set({ draft: text, prepared: !!attempt && attempt.text === text })
    persist()
  }

  const manageable = () =>
    !!s.connection &&
    !s.accessDenied &&
    (!s.id || s.hydrated) &&
    !s.snapshot.detail?.owned &&
    s.snapshot.detail?.writable !== false

  const writable = () => manageable() && !s.snapshot.detail?.archived

  const stoppable = () =>
    !!s.connection && !s.accessDenied && !!s.id && s.hydrated && s.snapshot.detail?.writable !== false
  const modes = () => {
    const defaults = s.choices?.modes
    if (!defaults?.available) return null
    if (s.id) return s.savedModes?.available ? s.savedModes : null
    return { ...defaults, ...s.draftModes }
  }
  async function loadModes() {
    if (!s.id || !s.connection || !s.choices?.modes?.available) return
    const owner = version,
      read = ++modeRead
    set("savedModes", undefined)
    try {
      const modes = await api<ConversationModes | null>(path() + "/modes", s.connection.scope)
      if (owner === version && read === modeRead) set("savedModes", modes)
    } catch (err) {
      if (owner === version && read === modeRead) fail(err)
    }
  }
  async function changeMode(key: keyof ModeValues, value: boolean) {
    const current = modes()
    if (!current || !writable() || s.sending || s.prepared || (key === "code_mode" && !current.code_mode_available)) return
    attempt = undefined
    if (!s.id) {
      set("draftModes", key, value)
      persist()
      return
    }
    ++modeRead
    set({ sending: true, error: "" })
    try {
      const result = await api<ConversationModes>(path() + "/modes", s.connection!.scope, { [key]: value })
      ++modeRead
      set("savedModes", result)
    } catch (err) {
      fail(err)
      await loadModes()
    } finally {
      set("sending", false)
    }
  }
  const latestSteer = () =>
    s.snapshot.pending
      .filter((i) => i.state === "steering" && i.delivery === "steer")
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .at(-1)
  async function send(now = false, preference = readFollowUpBehavior()) {
    const c = s.connection

    if (!c || s.sending || s.accessDenied || (!writable() && !(s.prepared && !s.hydrated && s.id))) return
    if (!s.draft.trim()) {
      const pending = latestSteer()
      if (now && pending) await command("promote", { id: pending.id, version: pending.version })
      return
    }
    const text = s.draft
    if (attempt && attempt.text !== text) attempt = undefined
    const running = !!s.snapshot.detail?.active || (!s.snapshot.detail && s.snapshot.busy)
    const delivery = running || (now && latestSteer()) ? (now ? "steer_now" : preference) : "queue"
    set({ sending: true, submitting: true, error: "" })
    try {
      if (!s.id && !attempt) {
        await choicesReady
        if (!s.choices?.modes?.available)
          throw new Error("Cannot prepare a reply until OpenCode provides its input policy.")
      }
      const initial = !s.id ? modes() : null
      attempt ??= {
        text,
        model: modelEdited ? s.model || null : null,
        clearModel: modelEdited && !s.model ? true : undefined,
        runner: s.runner,
        approval: s.approval,
        delivery,
        target:
          delivery !== "queue"
            ? (s.snapshot.turns.find((t) => t.id === s.snapshot.detail?.active)?.run ?? undefined)
            : undefined,
        initialModes: initial
          ? {
              code_mode: initial.code_mode_available && initial.code_mode,
              subagent: initial.subagent,
            }
          : undefined,
        createKey: uuid(),
        inputKey: uuid(),
      }
      const submission = attempt
      set("prepared", s.draft === submission.text)
      persist()
      if (!s.id) {
        const created = await api<{ id: string }>("/chats", c.scope, {
          title: "",
          runner: submission.runner,
          key: submission.createKey,
        })
        if (c.scope !== s.connection?.scope) return
        follow(created.id)
        persist()
        storage.setItem(storageKey() + ".draft.", "{}")
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
      const body = {
        key: submission.inputKey,
        text: submission.text,
        model: submission.model,
        clearModel: submission.clearModel,
        delivery: submission.delivery,
        approval: submission.approval,
        target: submission.target,
      }
      if (submission.initialModes && !submission.ticket) {
        // A lost PATCH response may already have saved the choices. Never repeat it over a later edit.
        if (submission.initializingModes) {
          const current = await api<ConversationModes | null>(path() + "/modes", c.scope)
          if (
            !current?.available ||
            current.code_mode !== submission.initialModes.code_mode ||
            current.subagent !== submission.initialModes.subagent
          )
            throw new Error(
              "Initial modes could not be confirmed. Edit the draft and check Run settings before sending.",
            )
        } else {
          submission.initializingModes = true
          persist()
          await api(path() + "/modes", c.scope, submission.initialModes)
        }
        delete submission.initialModes
        delete submission.initializingModes
        persist()
      }
      if (!submission.ticket) {
        const prepared = await api<{ ticket: string }>(path() + "/prepare", c.scope, body)
        submission.ticket = prepared.ticket
        persist()
      }
      await api(path() + "/inputs", c.scope, { ...body, ticket: submission.ticket })
      modelEdited = false
      attempt = undefined
      set({ draft: s.draft === submission.text ? "" : s.draft, prepared: false })
      persist()
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      set({ sending: false, submitting: false })
    }
  }
  async function earlier(beforePrepend?: () => (() => void) | undefined) {
    if (!s.id || !s.connection || s.loadingHistory || !s.hasOlder) return
    const owner = version
    set("loadingHistory", true)
    try {
      const page = await api<TurnPage>(
        path() + "/history?before=" + (s.snapshot.turns[0]?.position ?? 2147483647),
        s.connection.scope,
      )
      if (owner !== version) return
      const turns = [
        ...new Map([...page.items.map(projectTurn), ...s.snapshot.turns].map((turn) => [turn.id, turn])).values(),
      ].sort((a, b) => a.position - b.position)
      const restorePosition = beforePrepend?.()
      set("snapshot", reconcile({ ...s.snapshot, turns, expanded: true }))
      set("hasOlder", page.before_position !== null && page.items.length === HISTORY_PAGE_SIZE)
      restorePosition?.()
    } catch (error) {
      if (owner === version) fail(error)
    } finally {
      if (owner === version) set("loadingHistory", false)
    }
  }
  async function command(action: string, body: unknown) {
    if (!s.connection || !s.id || s.sending || s.accessDenied) return
    set({ sending: true, error: "" })
    try {
      const result = await api<{ notice?: string }>(path() + "/" + action, s.connection.scope, body)
      await refresh()
      if (result?.notice) set("error", result.notice)
      return true
    } catch (err) {
      fail(err)
      await refresh()
      return false
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
    configure,
    async schedulePreferences(id: string) {
      const current = id === s.id
      const draft = current ? s : savedDraft(id)
      const latest = (snapshot: Snapshot) => snapshot.turns.findLast((turn) => turn.responseModel)?.responseModel
      const currentModel = draft.model || (current && s.hydrated ? latest(s.snapshot)?.selected : undefined)
      if (currentModel && draft.approval) return { model: currentModel, approval: draft.approval }

      const snapshot = await api<Snapshot & { scheduleDefaults?: { model: string | null; approval: Approval } }>(
        "/chats/" + encodeURIComponent(id) + "?schedule=defaults",
        s.connection?.scope,
      )
      const response = latest(snapshot)
      return {
        model: currentModel || response?.selected || response?.actual || snapshot.scheduleDefaults?.model,
        approval: draft.approval ?? snapshot.scheduleDefaults?.approval,
      }
    },
    modes,
    changeMode,
    loadModes,
    writable,
    manageable,
    stoppable,
    latestSteer,
    manageSession,
    command,
    refresh,
    earlier,
    close: clearStream,
    stop: () => (stoppable() ? command("stop", {}) : Promise.resolve(false)),
    decide: (run: string, key: string, response: Resolution) => command("decisions", { run, key, response }),
  }
}
