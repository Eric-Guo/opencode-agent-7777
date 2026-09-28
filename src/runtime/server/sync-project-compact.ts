import type { OpenCodeEvent, Project } from "@opencode/client/promise"
import { createStore } from "solid-js/store"
import type { OpencodeClient } from "./client-compact"

// Project data belongs to the server sync boundary. Each instance owns one
// server/project pair and is disposed when the compact header changes scope.
export function createProjectSync(client: Pick<OpencodeClient, "project">, projectID: string) {
  const [state, setState] = createStore({
    project: undefined as Project | undefined,
    loading: false,
    failed: false,
  })
  let revision = 0
  let disposed = false

  const update = (project: Project) => {
    if (disposed || project.id !== projectID) return
    if (state.project && project.time.updated < state.project.time.updated) return
    revision++
    // Replace the record, including optional fields removed by the server.
    setState({ project: { ...project }, loading: false, failed: false })
  }

  return {
    project: () => state.project,
    loading: () => state.loading,
    failed: () => state.failed,
    async sync() {
      if (disposed || state.loading) return
      const version = ++revision
      setState({ loading: true, failed: false })
      try {
        const projects = await client.project.list()
        if (disposed || version !== revision) return
        const project = projects.find((item) => item.id === projectID)
        if (project) update(project)
        else setState({ project: undefined, failed: true })
      } catch {
        if (!disposed && version === revision) setState("failed", true)
      } finally {
        if (!disposed && version === revision) setState("loading", false)
      }
    },
    update,
    event(event: OpenCodeEvent) {
      if (event.type === "project.updated") update(event.data)
    },
    dispose() {
      disposed = true
      revision++
    },
  }
}
