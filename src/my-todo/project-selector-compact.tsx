import { createEffect, createMemo, on, onCleanup, Show } from "solid-js"
import { createServerSdk } from "@/runtime/server/client-compact"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { createProjectSync } from "@/runtime/server/sync-project-compact"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { ProjectSelector } from "./project-selector"

export function CompactProjectSelector() {
  const projectID = createMemo(() => state.session?.projectID)
  const source = createMemo(() => {
    const server = state.server
    const id = projectID()
    if (!server || !id) return
    return { server: createServerSdk(server), projectID: id }
  })

  return (
    <Show
      when={source()}
      keyed
      fallback={
        <span class="text-xl font-[720] leading-[1.1] tracking-[0] text-v2-text-text-base">{currentLocalAgent()}</span>
      }
    >
      {(source) => {
        const project = createProjectSync(source.server.client, source.projectID)
        onCleanup(project.dispose)
        onCleanup(sessionEvents.listen(project.event))
        // The stream can reconnect after this window missed a project change.
        createEffect(
          on(
            () => state.eventsConnected,
            (connected) => {
              if (connected) void project.sync()
            },
          ),
        )
        void project.sync()
        return (
          <ProjectSelector
            server={source.server}
            project={project.project() ?? { id: source.projectID }}
            loading={project.loading()}
            loadFailed={project.failed()}
            onRetry={() => void project.sync()}
            onUpdated={project.update}
          />
        )
      }}
    </Show>
  )
}
