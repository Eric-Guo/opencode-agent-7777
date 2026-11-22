import { DataProvider } from "@opencode/session-ui/context"
import { MarkdownProvider, type ReadMarkdownImage } from "@opencode/session-ui/context/markdown"
import { showToast } from "@opencode/ui/toast"
import { parsePathLineSuffix } from "@opencode/util/path"
import { createMemo, type ComponentProps } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { readLocalImage } from "@/runtime/server/image"
import type { SessionRuntime } from "@/runtime/server/runtime"
import { createMarkdownEcharts } from "@/session/timeline/markdown-echarts"
import { useSettings } from "@/settings/model"
import { readableError } from "@/shell/errors/readable"
import { resolveFilePath } from "@/workspaces/files/path"

export function SessionUIProvider(props: ComponentProps<typeof DataProvider> & { runtime?: SessionRuntime }) {
  const language = useLanguage()
  const settings = useSettings()
  const codeBlocks = createMarkdownEcharts()
  const directory = createMemo(() => props.directory)
  const readImage = createMemo<ReadMarkdownImage | undefined>(() => {
    const runtime = props.runtime
    const root = directory()
    if (!runtime || !root) return
    return (path, signal) => readLocalImage(runtime.api, root, path, AbortSignal.any([signal, runtime.signal]))
  })
  const openLocalFile = async (path: string) => {
    try {
      const target = resolveFilePath(directory(), parsePathLineSuffix(path).path)
      const error = await window.api?.openPath?.(target)
      if (error) throw new Error(error)
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("toast.file.open.failed.title"),
        description: readableError(error),
      })
    }
  }

  return (
    <DataProvider {...props}>
      <MarkdownProvider
        codeBlocks={codeBlocks}
        codeWrap={settings.general.wrapCodeBlocks()}
        readImage={readImage()}
        openLocalFile={window.api?.openPath ? openLocalFile : undefined}
      >
        {props.children}
      </MarkdownProvider>
    </DataProvider>
  )
}
