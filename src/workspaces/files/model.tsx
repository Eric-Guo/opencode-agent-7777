import { createStore } from "solid-js/store"
import type { OpencodeClient } from "@/runtime/server/client-compact"

type FileSearchScope = { client: Pick<OpencodeClient, "file">; directory: string }

// The compact app needs directory-scoped search, without file tabs or a workspace provider.
export function createFileSearch(scope: () => FileSearchScope | undefined) {
  const [state, setState] = createStore<{ status: "ready" | "loading" | "failed" }>({ status: "ready" })
  let version = 0
  let pending: AbortController | undefined

  const clear = () => {
    version++
    pending?.abort()
    pending = undefined
    setState("status", "ready")
  }

  return {
    state,
    clear,
    async searchFilesAndDirectories(query: string): Promise<string[]> {
      clear()
      const active = scope()
      if (!active || !query.trim()) return []
      const current = version
      const controller = new AbortController()
      pending = controller
      setState("status", "loading")
      try {
        const result = await active.client.file.find(
          { location: { directory: active.directory }, query, limit: 50 },
          { signal: controller.signal },
        )
        if (current !== version) return []
        setState("status", "ready")
        return [...new Set(result.data.map((entry) => entry.path))]
      } catch {
        if (current === version) setState("status", "failed")
        return []
      } finally {
        if (current === version) pending = undefined
      }
    },
  }
}
