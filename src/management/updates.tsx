import { For, Show, onMount, createEffect, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import type { PlatformDeploymentState, PlatformDeploymentUpgrade, PlatformDeploymentLog } from "@cybros/agent"
import type { ManagementClient } from "./client"
import { FieldRow } from "./fields"

const root = "/api/v1/admin/deployment"

export function Updates(props: { client: ManagementClient }) {
  const c = props.client

  const [s, set] = createStore({
    deployment: null as PlatformDeploymentState | null,
    tag: "",
    backup: true,
    key: crypto.randomUUID(),
    operation: null as PlatformDeploymentUpgrade | null,
    log: "",
    cursor: null as string | null,
    progressError: "",
  })

  const refresh = async () => {
    const deployment = (await c.platform<{ deployment: PlatformDeploymentState }>(root)).deployment

    if ((deployment.active_operation ?? deployment.last_operation)?.id !== s.operation?.id)
      set({ log: "", cursor: null })
    set("deployment", deployment)
    set("operation", deployment.active_operation ?? deployment.last_operation)
  }

  let reading = false

  const progress = async () => {
    if (!s.operation || reading) return
    const id = s.operation.id
    reading = true

    try {
      const log = (
        await c.platform<{ log: PlatformDeploymentLog }>(
          root +
            "/upgrades/" +
            encodeURIComponent(id) +
            "/log" +
            (s.cursor ? "?cursor=" + encodeURIComponent(s.cursor) : ""),
        )
      ).log

      if (s.operation?.id !== id) return
      set({
        operation: log.operation,
        log: s.log + log.entries.map((row) => row.text ?? "").join("\n"),
        cursor: log.next_cursor,
        progressError: "",
      })
    } finally {
      reading = false
    }
  }

  onMount(() => void c.perform(refresh))
  createEffect(
    on(
      () => s.operation?.id,
      (id) => {
        if (!id) return
        let active = true
        let timer: ReturnType<typeof setTimeout> | undefined

        const poll = async () => {
          if (!active || s.operation?.completed_at) return
          await progress().catch((error: unknown) => {
            if (active) set("progressError", error instanceof Error ? error.message : String(error))
          })

          if (active && !s.operation?.completed_at) timer = setTimeout(() => void poll(), 2000)
        }

        timer = setTimeout(() => void poll(), 1000)
        onCleanup(() => {
          active = false
          clearTimeout(timer)
        })
      },
    ),
  )

  return (
    <section>
      <h2>Updates</h2>
      <div class="nexus-card">
        <h3>OpenCode host</h3>
        <p>
          Use the desktop application's update control, or run <code>opencode upgrade</code> on the host. Restart the
          service after upgrading when the host asks you to.
        </p>
      </div>
      <div class="nexus-card">
        <h3>Nexus deployment</h3>
        <Button disabled={c.state.busy} onClick={() => void c.perform(refresh)}>
          Refresh deployment
        </Button>
        <Show when={s.deployment}>
          {(deployment) => (
            <>
              <p>Installed: {deployment().installed?.release ?? "Unknown"}</p>
              <Show
                when={deployment().supported}
                fallback={<p>This deployment is managed externally. Update it with its deployment administrator.</p>}
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void c.perform(async () => {
                      set(
                        "deployment",
                        (
                          await c.platform<{ deployment: PlatformDeploymentState }>(root + "/release_check", "POST", {
                            release_check: { ...(s.tag ? { tag: s.tag } : {}), backup: s.backup },
                          })
                        ).deployment,
                      )
                      set("key", crypto.randomUUID())
                    })
                  }}
                >
                  <FieldRow label="Release tag (optional)">
                    <input value={s.tag} onInput={(e) => set("tag", e.currentTarget.value)} />
                  </FieldRow>
                  <FieldRow label="Back up the database">
                    <input
                      type="checkbox"
                      checked={s.backup}
                      onChange={(e) => set("backup", e.currentTarget.checked)}
                    />
                  </FieldRow>
                  <Button type="submit" disabled={c.state.busy}>
                    Check release and requirements
                  </Button>
                </form>
                <Show when={deployment().candidate}>{(candidate) => <p>Candidate: {candidate().release}</p>}</Show>
                <For each={deployment().preflight?.checks}>
                  {(check) => (
                    <p>
                      {check.name}: {check.status} · {check.message}
                      <Show when={check.next_step}>
                        <small>{check.next_step}</small>
                      </Show>
                    </p>
                  )}
                </For>
                <Show
                  when={
                    deployment().candidate &&
                    deployment().preflight?.ready &&
                    deployment().preflight?.backup === s.backup &&
                    !deployment().active_operation
                  }
                >
                  <details>
                    <summary>Install checked release</summary>
                    <p>
                      Nexus may be unavailable while this deployment is upgraded. The candidate shown above and its
                      image references will be submitted once with a reusable operation key.
                    </p>
                    <Button
                      disabled={c.state.busy}
                      onClick={() =>
                        void c.perform(async () => {
                          const candidate = deployment().candidate!

                          const result = await c.platform<{ upgrade: PlatformDeploymentUpgrade }>(
                            root + "/upgrades",
                            "POST",
                            {
                              candidate: {
                                release: candidate.release,
                                images: candidate.images.map((image) => ({
                                  name: image.name,
                                  reference: image.reference,
                                })),
                              },
                              backup: s.backup,
                            },
                            s.key,
                          )

                          set({ operation: result.upgrade, log: "", cursor: null })
                          await progress()
                          await refresh()
                        })
                      }
                    >
                      Confirm installation
                    </Button>
                  </details>
                </Show>
              </Show>
            </>
          )}
        </Show>
        <Show when={s.operation}>
          {(operation) => (
            <div>
              <h3>
                {operation().target.release} · {operation().status}
              </h3>
              <p>{operation().phase}</p>
              <Show when={s.progressError}>
                <p role="alert">{s.progressError}</p>
              </Show>
              <Show when={operation().error}>
                <p class="nexus-error">{operation().error?.message}</p>
              </Show>
              <Show when={operation().recovery}>
                <p>{operation().recovery}</p>
              </Show>
              <Button disabled={c.state.busy} onClick={() => void c.perform(progress)}>
                Read progress
              </Button>
              <pre>{s.log}</pre>
            </div>
          )}
        </Show>
      </div>
    </section>
  )
}
