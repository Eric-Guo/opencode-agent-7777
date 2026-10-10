import { ErrorBoundary, lazy, Match, Suspense, Switch } from "solid-js"
import { Spinner } from "@opencode/ui/spinner"
import { useLanguage } from "@/runtime/i18n/language"
import type { OfficeKind } from "@/workspaces/files/artifact"

export type OfficeViewerProps = {
  readonly bytes: Uint8Array
  onDetails(details: readonly string[]): void
  onError(): void
}

// Each format loads only its own engine, worker and fonts when its preview opens.
const OfficeDocument = lazy(() => import("./document"))
const OfficePresentation = lazy(() => import("./presentation"))
const OfficeSpreadsheet = lazy(() => import("./spreadsheet"))

export function OfficePreview(props: OfficeViewerProps & { format: OfficeKind }) {
  const language = useLanguage()

  return (
    <ErrorBoundary fallback={<div class="file-panel-status">{language.t("files.previewUnavailable")}</div>}>
      <Suspense
        fallback={
          <div class="file-panel-status" role="status">
            <Spinner class="size-4" />
            {language.t("files.loading")}
          </div>
        }
      >
        <Switch>
          <Match when={props.format === "document"}>
            <OfficeDocument {...props} />
          </Match>
          <Match when={props.format === "presentation"}>
            <OfficePresentation {...props} />
          </Match>
          <Match when={props.format === "spreadsheet"}>
            <OfficeSpreadsheet {...props} />
          </Match>
        </Switch>
      </Suspense>
    </ErrorBoundary>
  )
}
