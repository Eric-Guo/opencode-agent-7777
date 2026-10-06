import { SessionReview, type SessionReviewDiffStyle } from "@opencode/session-ui/session-review"
import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import { Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import type { SessionRuntime } from "@/runtime/server/runtime"
import { sessionEvents } from "@/runtime/server/sync-session-compact"
import { readableError } from "@/shell/errors/readable"
import { createReviewModel } from "./model"
import { ReviewDescription, ReviewEmpty, ReviewTitle } from "./parts"

export default function ReviewPanel(props: { runtime: SessionRuntime }) {
  const language = useLanguage()
  const [view, setView] = createStore({ diffStyle: "unified" as SessionReviewDiffStyle })
  const review = createReviewModel({
    client: props.runtime.api,
    sessionID: props.runtime.id,
    directory: props.runtime.view().session.location.directory,
    signal: props.runtime.signal,
  })
  onCleanup(review.dispose)
  onCleanup(sessionEvents.listen(review.event))
  void review.refresh()

  return (
    <>
      <div class="flex flex-wrap items-center gap-3 border-b border-border-weak-base px-4 py-2">
        <div class="min-w-0 flex-1 basis-64 space-y-2">
          <ReviewTitle review={review} />
          <ReviewDescription review={review} />
        </div>
        <Button variant="ghost" size="small" disabled={review.state.loading} onClick={() => void review.refresh()}>
          {language.t("review.refresh")}
        </Button>
      </div>
      <Show when={review.state.loading}>
        <div class="flex items-center justify-center gap-2 p-6" role="status">
          <Spinner class="size-4" />
          {language.t("review.loading")}
        </div>
      </Show>
      <Show when={!review.state.loading && review.state.error}>
        <div class="flex flex-col items-center gap-2 p-6 text-13-regular" role="alert">
          <span>{language.t("review.loadFailed")}</span>
          <span class="max-w-full break-words text-text-weak">{readableError(review.state.error)}</span>
          <Button variant="neutral" onClick={() => void review.refresh()}>
            {language.t("review.retry")}
          </Button>
        </div>
      </Show>
      <Show when={!review.state.loading && !review.state.error}>
        <SessionReview
          class="min-h-0 flex-1"
          classes={{ header: "px-4 !h-auto min-h-12 !py-2 max-sm:!flex max-sm:flex-wrap max-sm:gap-2" }}
          diffs={review.state.diffs}
          diffStyle={view.diffStyle}
          onDiffStyleChange={(style) => setView("diffStyle", style)}
          empty={<ReviewEmpty review={review} />}
        />
      </Show>
    </>
  )
}
