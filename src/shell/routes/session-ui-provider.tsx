import { DataProvider } from "@opencode/session-ui/context"
import { MarkdownProvider } from "@opencode/session-ui/context/markdown"
import { showToast } from "@opencode/ui/toast"
import { parsePathLineSuffix } from "@opencode/util/path"
import type { ComponentProps } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createMarkdownEcharts } from "@/session/timeline/markdown-echarts"
import { useSettings } from "@/settings/model"
import { readableError } from "@/shell/errors/readable"
import { resolveFilePath } from "@/workspaces/files/path"

export function SessionUIProvider(props: ComponentProps<typeof DataProvider>) {
  const language = useLanguage()
  const settings = useSettings()
  const codeBlocks = createMarkdownEcharts()
  const openLocalFile = async (path: string) => {
    try {
      const target = resolveFilePath(props.directory, parsePathLineSuffix(path).path)
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
        openLocalFile={window.api?.openPath ? openLocalFile : undefined}
      >
        {props.children}
      </MarkdownProvider>
    </DataProvider>
  )
}
