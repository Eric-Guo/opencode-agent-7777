import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { ErrorBoundary, Suspense, createEffect, lazy, on, onCleanup } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { currentRuntime, state } from "@/runtime/server/session-store-compact"

const ReviewPanel = lazy(() => import("./panel"))

// Upstream mounts review through the extension host; the compact app opens a dialog.
export function ReviewTrigger() {
  const language = useLanguage()
  const dialog = useDialog()
  const id = "compact-session-review"
  createEffect(on(currentRuntime, () => dialog.close(id), { defer: true }))
  onCleanup(() => dialog.close(id))

  const open = () => {
    const runtime = currentRuntime()
    if (!runtime || runtime.signal.aborted) return
    const title = state.session?.title

    void dialog.show(
      () => (
        <Dialog containerClass="!h-[min(80vh,900px)] !w-[min(calc(100vw_-_16px),1100px)]">
          <DialogHeader closeLabel={language.t("common.close")}>
            <DialogTitle>{language.t("review.title")}</DialogTitle>
            <span class="truncate text-12-regular text-text-weak" title={title}>
              {title}
            </span>
          </DialogHeader>
          <DialogBody class="min-h-0 flex-1 gap-0 overflow-hidden !p-0">
            <ErrorBoundary
              fallback={
                <div class="p-6" role="alert">
                  {language.t("review.loadFailed")}
                </div>
              }
            >
              <Suspense
                fallback={
                  <div class="p-6" role="status">
                    {language.t("review.loading")}
                  </div>
                }
              >
                <ReviewPanel runtime={runtime} />
              </Suspense>
            </ErrorBoundary>
          </DialogBody>
        </Dialog>
      ),
      undefined,
      id,
      runtime.signal,
    )
  }

  return (
    <button
      type="button"
      class="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 text-v2-text-text-muted hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base disabled:opacity-55"
      aria-label={language.t("review.title")}
      title={language.t("review.title")}
      disabled={!currentRuntime()}
      onClick={open}
    >
      <Icon name="code" size="small" />
    </button>
  )
}
