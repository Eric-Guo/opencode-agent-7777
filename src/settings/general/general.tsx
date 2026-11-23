import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { useLanguage } from "@/runtime/i18n/language"
import { useSettings } from "../model"

// The embedded app exposes general preferences in its header instead of a routed settings page.
export function SettingsGeneral() {
  const language = useLanguage()
  const settings = useSettings()
  const title = () => language.t("settings.general.row.followUpBehavior.title")
  const keybind = () =>
    typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform) ? "⌘↵" : "Ctrl+Enter"
  return (
    <Menu gutter={4} placement="bottom-end" modal={false}>
      <Menu.Trigger
        data-action="settings-follow-up-behavior"
        class="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
        aria-label={title()}
        title={title()}
      >
        <Icon name="settings-gear" size="small" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content class="w-[276px] max-w-[calc(100vw-28px)]">
          <Menu.Group>
            <Menu.GroupLabel>{title()}</Menu.GroupLabel>
            <p class="px-2 pb-2 text-xs leading-5 text-v2-text-text-muted">
              {language.t("settings.general.row.followUpBehavior.description", { keybind: keybind() })}
            </p>
            <Menu.RadioGroup
              value={settings.general.followUpBehavior()}
              onChange={(value) => {
                if (value === "queue" || value === "steer") settings.general.setFollowUpBehavior(value)
              }}
            >
              <Menu.RadioItem value="queue" closeOnSelect>
                {language.t("settings.general.row.followUpBehavior.queue")}
              </Menu.RadioItem>
              <Menu.RadioItem value="steer" closeOnSelect>
                {language.t("settings.general.row.followUpBehavior.steer")}
              </Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Group>
          <Menu.Separator />
          <Menu.Group>
            <Menu.GroupLabel>{language.t("settings.timeline.title")}</Menu.GroupLabel>
            <Menu.CheckboxItem
              checked={settings.general.showTurnDiffs()}
              onChange={settings.general.setShowTurnDiffs}
              closeOnSelect
            >
              {language.t("settings.timeline.row.turnDiffs.title")}
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              checked={settings.general.wrapCodeBlocks()}
              onChange={settings.general.setWrapCodeBlocks}
              closeOnSelect
            >
              {language.t("settings.timeline.row.wrapCodeBlocks.title")}
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              checked={settings.general.shellToolPartsExpanded()}
              onChange={settings.general.setShellToolPartsExpanded}
              closeOnSelect
            >
              {language.t("settings.general.row.shellToolPartsExpanded.title")}
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              checked={settings.general.editToolPartsExpanded()}
              onChange={settings.general.setEditToolPartsExpanded}
              closeOnSelect
            >
              {language.t("settings.general.row.editToolPartsExpanded.title")}
            </Menu.CheckboxItem>
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
