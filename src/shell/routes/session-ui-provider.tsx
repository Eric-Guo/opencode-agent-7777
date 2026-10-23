import { DataProvider } from "@opencode/session-ui/context"
import { MarkdownProvider } from "@opencode/session-ui/context/markdown"
import { showToast } from "@opencode/ui/toast"
import { parsePathLineSuffix } from "@opencode/util/path"
import type { ComponentProps } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { readableError } from "@/shell/errors/readable"
import { fileUrl } from "@/workspaces/files/path"

export function SessionUIProvider(props: ComponentProps<typeof DataProvider>) {
  const language = useLanguage()
  const openLocalFile = async (path: string) => {
    try {
      // Markdown supplies decoded paths. Resolve relative links against this session, preserving filename characters.
      const url = new URL(fileUrl(props.directory, parsePathLineSuffix(path).path))
      const target = decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/i, "$1")
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
      <MarkdownProvider openLocalFile={window.api?.openPath ? openLocalFile : undefined}>
        {props.children}
      </MarkdownProvider>
    </DataProvider>
  )
}
