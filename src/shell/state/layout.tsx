import { createStore } from "solid-js/store"
import { storageGet, storageRemove, storageSet } from "@/runtime/persistence/storage"
import { normalizeWorkspacePath } from "@/workspaces/files/path"
import {
  closeSessionTab,
  moveSessionTab,
  openSessionTab,
  previewSessionTab,
  type SessionTabs,
  type SessionTabState,
} from "./session-tabs"

export type SessionLayoutScope = {
  server: string
  directory: string
  // Reuse the desktop tab's configured namespace without changing its session record.
  storageKey: string
}

function readTabs(key: string, directory: string): SessionTabs {
  try {
    const value: unknown = JSON.parse(storageGet(key) ?? "null")
    if (!value || typeof value !== "object") return { all: [] }
    const saved = value as { all?: unknown; active?: unknown }
    const path = (value: unknown) => (typeof value === "string" ? normalizeWorkspacePath(directory, value) : undefined)
    const all = [...new Set(Array.isArray(saved.all) ? saved.all.flatMap((item) => path(item) || []) : [])]
    const active = path(saved.active)
    return { all, active: active && all.includes(active) ? active : undefined }
  } catch {
    return { all: [] }
  }
}

function createTabs(key?: string, directory = "") {
  const [state, setState] = createStore<SessionTabState>({ tabs: key ? readTabs(key, directory) : { all: [] } })
  const apply = (next: SessionTabState) => {
    if (!key || next === state) return
    setState(next)
    // Like the main layout, persist the open files and selection, but keep preview status ephemeral.
    if (state.tabs.all.length) storageSet(key, JSON.stringify(state.tabs))
    else storageRemove(key)
  }
  const normalize = (path: string) => normalizeWorkspacePath(directory, path)
  return {
    state,
    select(path?: string) {
      const active = path === undefined ? undefined : normalize(path)
      if (path !== undefined && (!active || !state.tabs.all.includes(active))) return
      apply({ tabs: { all: [...state.tabs.all], active }, preview: state.preview })
    },
    preview(path: string) {
      const tab = normalize(path)
      if (tab) apply(previewSessionTab(state, tab))
    },
    open(path: string) {
      const tab = normalize(path)
      if (tab) apply(openSessionTab(state, tab))
    },
    close(path: string) {
      const tab = normalize(path)
      if (tab && state.tabs.all.includes(tab)) apply(closeSessionTab(state, tab))
    },
    move(path: string, to: number) {
      const tab = normalize(path)
      if (tab) apply(moveSessionTab(state, tab, to))
    },
  }
}

// Reduced main-app layout boundary: one file-tab state per desktop tab, server, and workspace.
// Each scope owns its store so a workspace switch cannot persist the previous scope's tabs under a new key.
export function createSessionLayout() {
  const scopes = new Map<string, ReturnType<typeof createTabs>>()
  const empty = createTabs()
  return {
    tabs(scope?: SessionLayoutScope) {
      if (!scope?.server || !scope.directory || !scope.storageKey) return empty
      const key = `opencode.sessionTabs:${JSON.stringify([scope.storageKey, scope.server, scope.directory])}`
      const existing = scopes.get(key)
      if (existing) return existing
      const tabs = createTabs(key, scope.directory)
      scopes.set(key, tabs)
      return tabs
    },
  }
}
