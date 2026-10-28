import { createData, type Data } from "@opencode/client/solid"
import { createRoot, onCleanup } from "solid-js"
import type { OpencodeClient } from "@/runtime/server/client-compact"

// A draft needs location catalogs, but has no session ID or server-side session resources.
export type SessionDraft = {
  api: OpencodeClient
  directory: string
  data: Data
  signal: AbortSignal
  dispose: () => void
}

export function createSessionDraft(api: OpencodeClient, directory: string): SessionDraft {
  return createRoot((dispose) => {
    const abort = new AbortController()
    onCleanup(() => abort.abort())
    const data = createData({
      directory,
      api: () => api,
      event: { on: () => () => {}, listen: () => () => {} },
    })
    return { api, directory, data, signal: abort.signal, dispose }
  })
}
