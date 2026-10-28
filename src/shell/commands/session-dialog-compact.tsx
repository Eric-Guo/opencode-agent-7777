import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { ErrorBoundary, Suspense, createEffect, on, onCleanup, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { SessionRuntime } from "@/runtime/server/runtime"
import { currentRuntime } from "@/runtime/server/session-store-compact"

// Embedded session tools share a dialog lifecycle instead of mounting the main app's plugin host.
export function useSessionDialog(input: {
  id: string
  title: () => string
  loading: () => string
  failed: () => string
  containerClass: string
  render: (runtime: SessionRuntime) => JSX.Element
}) {
  const language = useLanguage()
  const dialog = useDialog()
  createEffect(on(currentRuntime, () => dialog.close(input.id), { defer: true }))
  onCleanup(() => dialog.close(input.id))

  return () => {
    const runtime = currentRuntime()
    if (!runtime || runtime.signal.aborted) return
    const title = runtime.view().session.title

    void dialog.show(
      () => (
        <Dialog containerClass={input.containerClass}>
          <DialogHeader closeLabel={language.t("common.close")}>
            <DialogTitle>{input.title()}</DialogTitle>
            <span class="truncate text-12-regular text-text-weak" title={title}>
              {title}
            </span>
          </DialogHeader>
          <DialogBody class="min-h-0 flex-1 gap-0 overflow-hidden !p-0">
            <ErrorBoundary
              fallback={
                <div class="p-6" role="alert">
                  {input.failed()}
                </div>
              }
            >
              {/* Only the tool's first lazy module load suspends; the dialog keeps its fixed size. */}
              <Suspense
                fallback={
                  <div class="p-6" role="status">
                    {input.loading()}
                  </div>
                }
              >
                {input.render(runtime)}
              </Suspense>
            </ErrorBoundary>
          </DialogBody>
        </Dialog>
      ),
      undefined,
      input.id,
      runtime.signal,
    )
  }
}
