import type { Project } from "@opencode/client/promise"
import type { MyTodo } from "@opencode/schema/my-todo"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { createResource, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { SelectProjectDialog } from "@/my-todo/select-project-dialog"
import { useLanguage } from "@/runtime/i18n/language"
import type { ServerSdk } from "@/runtime/server/client-compact"

export function ProjectSelector(props: {
  server: ServerSdk
  project: Pick<Project, "id" | "myTodo">
  loading?: boolean
  loadFailed?: boolean
  onRetry: () => void
  onUpdated: (project: Project) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const selected = () => props.project.myTodo
  let active = true
  let opened: { closed: boolean } | undefined
  onCleanup(() => {
    active = false
    if (opened && !opened.closed) dialog.close()
  })

  const open = () => {
    const client = props.server.client
    const projectID = props.project.id
    if (opened && !opened.closed) return
    const selection = { closed: false }
    opened = selection
    dialog.show(
      () => {
        onCleanup(() => {
          selection.closed = true
        })
        const [status, setStatus] = createStore({ saving: false, loadFailed: false, saveFailed: false })
        const [projects, { refetch }] = createResource(async () => {
          setStatus("loadFailed", false)
          return client.server.myTodoProjects().catch(() => {
            setStatus("loadFailed", true)
            return []
          })
        })
        const select = async (project: MyTodo.Project) => {
          if (!active || selection.closed || status.saving) return
          setStatus({ saving: true, saveFailed: false })
          const saved = await client.project.update({ projectID, myTodo: project }).catch(() => {
            if (active && !selection.closed) setStatus({ saving: false, saveFailed: true })
            return undefined
          })
          if (!saved || !active) return
          props.onUpdated(saved)
          if (selection.closed) return
          dialog.close()
        }
        return (
          <SelectProjectDialog
            projects={projects() ?? []}
            value={selected()?.work_package_id}
            busy={status.saving}
            onSelect={select}
          >
            <Show when={projects.loading || status.loadFailed || status.saveFailed || projects()?.length === 0}>
              <p class="px-3 py-2 text-[13px] leading-5 text-v2-text-text-muted" role="status">
                {status.saveFailed
                  ? language.t("myTodo.saveFailed")
                  : status.loadFailed
                    ? language.t("myTodo.loadFailed")
                    : projects.loading
                      ? language.t("common.loading")
                      : language.t("myTodo.empty")}
              </p>
            </Show>
            <Show when={status.loadFailed}>
              <Button variant="ghost" onClick={() => void refetch()}>
                {language.t("myTodo.retry")}
              </Button>
            </Show>
          </SelectProjectDialog>
        )
      },
      () => {
        selection.closed = true
      },
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={open}
        class="-ml-2 !h-7 min-w-0 max-w-[min(50vw,32rem)] !justify-start !px-2 !text-xl !font-[720] !leading-[1.1] !tracking-[0] [app-region:no-drag] [-webkit-app-region:no-drag]"
        title={selected()?.project_name ?? language.t("myTodo.selectProject")}
        aria-label={language.t("myTodo.selectProject")}
        aria-busy={props.loading}
      >
        <span class="min-w-0 truncate">{selected()?.project_name ?? language.t("myTodo.selectProject")}</span>
      </Button>
      <Show when={props.loadFailed}>
        <Button variant="ghost" onClick={props.onRetry} title={language.t("myTodo.currentLoadFailed")}>
          {language.t("myTodo.retry")}
        </Button>
      </Show>
    </>
  )
}
