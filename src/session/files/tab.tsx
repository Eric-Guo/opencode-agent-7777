import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tabs } from "@opencode/ui/tabs"
import { useSortable } from "@dnd-kit/solid/sortable"
import { useLanguage } from "@/runtime/i18n/language"

export function SortableTab(props: {
  path: string
  index: number
  temporary: boolean
  onClose: () => void
  onKeep: () => void
  onMove: (to: number) => void
}) {
  const language = useLanguage()
  const sortable = useSortable({
    get id() {
      return props.path
    },
    get index() {
      return props.index
    },
  })
  return (
    <div ref={sortable.ref} data-slot="session-sortable-tab" class="flex h-full shrink-0 items-center">
      <Tabs.Trigger
        value={props.path}
        title={`${props.path}\n${language.t("files.reorderTab")}`}
        aria-label={props.path}
        aria-description={language.t("files.reorderTab")}
        aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
        onMiddleClick={props.onClose}
        onDblClick={props.onKeep}
        onKeyDown={(event) => {
          if (event.isComposing || event.defaultPrevented) return
          if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
            event.preventDefault()
            event.stopPropagation()
            const tab = event.currentTarget
            props.onMove(props.index + (event.key === "ArrowLeft" ? -1 : 1))
            queueMicrotask(() => {
              if (tab.isConnected) tab.focus({ preventScroll: true })
            })
            return
          }
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
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              props.onClose()
            }}
          />
        }
      >
        <span class="truncate" classList={{ italic: props.temporary }}>
          {props.path.split("/").at(-1)}
        </span>
      </Tabs.Trigger>
    </div>
  )
}
