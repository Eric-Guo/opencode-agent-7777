import { For, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import type { useOpenInApp } from "./open-in-app"

type OpenInAppState = ReturnType<typeof useOpenInApp>

function OpenInAppMenuItems(props: { state: OpenInAppState; path: () => string }) {
  const language = useLanguage()
  return (
    <>
      <Show when={props.state.canOpen()}>
        <Menu.Group>
          <Menu.GroupLabel>{language.t("session.header.openIn")}</Menu.GroupLabel>
          <Menu.Item disabled={props.state.opening()} onSelect={() => void props.state.openPath(props.path())}>
            {language.t("files.openDefault")}
          </Menu.Item>
          <Menu.Item
            disabled={props.state.opening()}
            onSelect={() => void props.state.openPath(props.path(), undefined, true)}
          >
            {language.t("files.reveal")} ({props.state.fileManager()})
          </Menu.Item>
          <For each={props.state.options()}>
            {(app) => (
              <Menu.Item
                disabled={props.state.opening()}
                onSelect={() => void props.state.openPath(props.path(), app.openWith)}
              >
                {language.t(app.label)}
              </Menu.Item>
            )}
          </For>
        </Menu.Group>
        <Menu.Separator />
      </Show>
      <Menu.Item onSelect={() => void props.state.copyPath(props.path())}>
        <Icon name="copy" size="small" />
        {language.t("session.header.open.copyPath")}
      </Menu.Item>
    </>
  )
}

export function OpenInAppButton(props: { state: OpenInAppState; path: () => string }) {
  const language = useLanguage()
  return (
    <Menu modal={false} placement="bottom-end">
      <Menu.Trigger class="file-panel-icon-button" aria-label={language.t("files.openMenu")} disabled={!props.path()}>
        <Icon name="outline-dots" size="small" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content>
          <OpenInAppMenuItems {...props} />
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}

export function OpenInAppContextMenuV2(props: ParentProps<{ state: OpenInAppState; path: () => string }>) {
  const [menu, setMenu] = createStore({ open: false })
  return (
    <Menu.Context modal={false} onOpenChange={(open) => setMenu("open", open)}>
      <Menu.Context.Trigger
        as="div"
        class="h-full w-full min-w-max"
        data-slot="file-tree-v2-context-trigger"
        data-context-menu-open={menu.open ? "" : undefined}
      >
        {props.children}
      </Menu.Context.Trigger>
      <Menu.Context.Portal>
        <Menu.Context.Content>
          <OpenInAppMenuItems {...props} />
        </Menu.Context.Content>
      </Menu.Context.Portal>
    </Menu.Context>
  )
}
