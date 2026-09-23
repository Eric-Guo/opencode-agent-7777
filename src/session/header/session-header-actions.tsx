import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import type { SessionRevert } from "@/session/revert"

// Compact header actions replace the main app's command-provider entries.
export function SessionHeaderActions(props: { revert: SessionRevert }) {
  const language = useLanguage()
  const buttonClass =
    "inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 text-v2-text-text-muted hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover hover:enabled:text-v2-text-text-base disabled:opacity-55"
  return (
    <div data-slot="session-header-history-actions" class="flex items-center gap-1">
      <button
        type="button"
        class={buttonClass}
        aria-label={language.t("command.session.undo")}
        title={language.t("command.session.undo.description")}
        disabled={!props.revert.canUndo()}
        onClick={() => void props.revert.undo()}
      >
        <Icon name="arrow-undo-down" size="small" />
      </button>
      <button
        type="button"
        class={buttonClass}
        aria-label={language.t("command.session.redo")}
        title={language.t("command.session.redo.description")}
        disabled={!props.revert.canRedo()}
        onClick={() => void props.revert.redo()}
      >
        <Icon name="arrow-undo-down" size="small" class="-scale-x-100" />
      </button>
    </div>
  )
}
