import type { PromptAttachment } from "@opencode/client/promise"
import type { SessionUserActions } from "@opencode/session-ui/actions"
import { showToast } from "@opencode/ui/toast"
import { base64ToBytes } from "@opencode/util/base64"
import { getFilename } from "@opencode/util/path"
import { useLanguage } from "@/runtime/i18n/language"
import { inlineBase64 } from "@/runtime/persistence/base64"
import { downloadFile } from "@/runtime/platform/download"
import type { createSessionFork } from "@/session/fork"
import type { createSessionRevert } from "@/session/revert"
import { readableError } from "@/shell/errors/readable"

async function attachmentBlob(file: PromptAttachment) {
  let data = "data" in file ? file.data : undefined
  // Before admission, the local echo carries a URL and an empty data field.
  const uri = file.source?.type === "uri" ? file.source.uri : undefined
  if (!data && (uri?.startsWith("data:") || uri?.startsWith("blob:"))) {
    const payload = inlineBase64(uri)
    if (payload === undefined) {
      const response = await fetch(uri)
      if (response.ok) return new Blob([await response.blob()], { type: file.mime })
      return
    }
    data = decodeURIComponent(payload)
  }
  if (data !== undefined) return new Blob([base64ToBytes(data)], { type: file.mime })
}

export function createTimelineActions(input: {
  revert: ReturnType<typeof createSessionRevert>
  fork: ReturnType<typeof createSessionFork>
  pending: () => SessionUserActions["pending"]
  chooseModel: () => SessionUserActions["chooseModel"]
}): SessionUserActions {
  const language = useLanguage()
  const revert: NonNullable<SessionUserActions["revert"]> = ({ messageID }) => input.revert.to(messageID)
  return {
    async openAttachment(file) {
      const filename = getFilename(file.name) || "attachment"
      const failed = (description: string) =>
        showToast({ variant: "error", title: language.t("toast.file.open.failed.title"), description })
      try {
        const blob = await attachmentBlob(file)
        if (blob) downloadFile(filename, blob)
        else failed(filename)
      } catch (error) {
        failed(readableError(error))
      }
    },
    get revert() {
      return input.revert.canUndo() ? revert : undefined
    },
    get fork() {
      const action = input.fork()
      return action?.available() ? action.fork : undefined
    },
    get pending() {
      return input.pending()
    },
    get chooseModel() {
      return input.chooseModel()
    },
  }
}
