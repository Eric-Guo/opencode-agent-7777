import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tabs } from "@opencode/ui/tabs"
import { useLanguage } from "@/runtime/i18n/language"

export function FileTab(props: { path: string; temporary: boolean; onClose: () => void; onKeep: () => void }) {
  const language = useLanguage()
  return (
    <Tabs.Trigger
      value={props.path}
      title={props.path}
      aria-label={props.path}
      onMiddleClick={props.onClose}
      onDblClick={props.onKeep}
      onKeyDown={(event) => {
        if (event.key !== "Delete") return
        event.preventDefault()
        props.onClose()
      }}
      closeButton={
        <IconButton
          size="small"
          variant="ghost-muted"
          icon={<Icon name="xmark-small" />}
          aria-label={language.t("files.closeTab", { path: props.path })}
          onPointerDown={(event) => event.preventDefault()}
          onClick={props.onClose}
        />
      }
    >
      <span class="truncate" classList={{ italic: props.temporary }}>
        {props.path.split("/").at(-1)}
      </span>
    </Tabs.Trigger>
  )
}
