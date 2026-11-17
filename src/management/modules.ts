import { createSignal } from "solid-js"
import type { Nexus } from "@opencode/schema/nexus"
import type { Schema } from "effect"
import type { ManagementClient } from "./client"

export type Slot =
  | "main"
  | "sidebar.panellist"
  | "settings.section"
  | "bots.item.config"
  | "plugins.item.config"
  | "dock.tab"
  | "task.detail"
  | "conversation.header.utilities"

export type Contribution = { element: HTMLElement; update?(props: Record<string, unknown>): void; dispose?(): void }

export type UIHandle = {
  id: string
  signal: AbortSignal
  slots: {
    register(
      slot: Slot,
      options: { id: string; label?: string; order?: number; priority?: number },
      component: (props: Record<string, unknown>) => Contribution,
    ): () => void
  }
  command<T>(name: string, input?: Schema.Json): Promise<T>
  navigate(key: string): void
  refresh(): Promise<void>
}

type Entry = {
  owner: string
  slot: Slot
  id: string
  label: string
  order: number
  priority: number
  component: (props: Record<string, unknown>) => Contribution
}

export function createModuleHost(
  client: ManagementClient,
  navigate: (key: string) => void,
  load = (url: string): Promise<{ register(ui: UIHandle): Promise<void> | void }> => import(/* @vite-ignore */ url),
) {
  const [entries, setEntries] = createSignal<Entry[]>([])
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const modules = new Map<string, { version: string; abort: AbortController }>()

  const dispose = (id: string) => {
    modules.get(id)?.abort.abort()
    modules.delete(id)
    setEntries((rows) => rows.filter((row) => row.owner !== id))
    setErrors((errors) => Object.fromEntries(Object.entries(errors).filter(([owner]) => owner !== id)))
  }

  const refresh = async () => {
    const scope = client.scope()
    const inventory = await client.command<Nexus.Extension[]>({ action: "extension.list" })

    if (scope === client.scope()) await sync(inventory)
  }

  async function sync(inventory: Nexus.Extension[]) {
    const live = inventory.filter((row) => row.active && row.webui)

    for (const [id, state] of modules)
      if (!live.some((row) => row.id === id && row.webui?.version === state.version)) dispose(id)
    await Promise.all(
      live.map(async (row) => {
        if (modules.has(row.id)) return
        const abort = new AbortController()
        const version = row.webui!.version
        modules.set(row.id, { version, abort })
        const scope = encodeURIComponent(client.scope()!)
        const url = `/api/7777/modules/${scope}/${encodeURIComponent(row.id)}/${version}/${row.webui!.entry}`

        try {
          const module = await load(url)

          if (abort.signal.aborted) return
          setErrors((errors) => Object.fromEntries(Object.entries(errors).filter(([id]) => id !== row.id)))
          await module.register({
            id: row.id,
            signal: abort.signal,
            command: client.extension,
            navigate,
            refresh,
            slots: {
              register(slot, options, component) {
                if (abort.signal.aborted) throw new Error("This UI module has been disposed.")

                const entry = {
                  owner: row.id,
                  slot,
                  ...options,
                  label: options.label ?? options.id,
                  order: options.order ?? 0,
                  priority: options.priority ?? 0,
                  component,
                }

                if (
                  entries().some(
                    (item) => item.slot === slot && item.id === entry.id && item.priority === entry.priority,
                  )
                )
                  throw new Error("Duplicate UI slot: " + slot + "/" + entry.id)
                setEntries((rows) => [...rows, entry])

                return () => setEntries((rows) => rows.filter((item) => item !== entry))
              },
            },
          })
        } catch (error) {
          if (modules.get(row.id)?.abort !== abort) return
          dispose(row.id)
          // Retain the failed version so refreshing inventory cannot repeat partial registration effects.
          modules.set(row.id, { version, abort })
          setErrors((errors) => ({ ...errors, [row.id]: error instanceof Error ? error.message : String(error) }))
        }
      }),
    )
  }

  return {
    sync,
    refresh,
    errors,
    entries: (slot: Slot) =>
      [
        ...new Map(
          entries()
            .filter((row) => row.slot === slot)
            .sort((a, b) => b.priority - a.priority)
            .map((row) => [row.id, row]),
        ).values(),
      ].sort((a, b) => a.order - b.order),
    close: () => [...modules.keys()].forEach(dispose),
  }
}

export type ModuleHost = ReturnType<typeof createModuleHost>
