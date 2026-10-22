import type { PermissionRequest } from "@opencode/client/promise"
import { PermissionPrompt, type PermissionPromptProps } from "@opencode/session-ui/permission-prompt"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: PermissionPromptProps["onDecide"]
}) {
  const language = useLanguage()
  const description = () => {
    const key = `settings.permissions.tool.${props.request.action}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    return value === key ? "" : value
  }

  return (
    <PermissionPrompt
      title={language.t("notification.permission.title")}
      description={description()}
      resources={props.request.resources}
      responding={props.responding}
      onDecide={props.onDecide}
    />
  )
}
