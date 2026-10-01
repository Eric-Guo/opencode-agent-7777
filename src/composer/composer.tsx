import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createMemo, Show } from "solid-js"
import { DEFAULT_MODEL_CONFIG } from "@/providers/models/default-config"
import { ProviderModelIcon } from "@/providers/models/provider-group"
import { ModelSelectorPopover } from "@/providers/models/select-dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { ComposerEditor } from "./editor/editor"
import type { ComposerModel } from "./model"

const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)

export function Composer(props: { model: ComposerModel }) {
  const language = useLanguage()
  const selectedModel = createMemo(() => props.model.model.selection.current())
  const modelName = createMemo(() => {
    if (props.model.model.status === "loading") return language.t("model.loading")
    return selectedModel()?.name ?? language.t("dialog.model.select.title")
  })
  const modelDisabled = createMemo(
    () =>
      props.model.disabled() ||
      props.model.model.status !== "ready" ||
      (!DEFAULT_MODEL_CONFIG.manageModels &&
        !props.model.model.selection
          .list()
          .some((item) => props.model.model.selection.visible({ modelID: item.id, providerID: item.provider.id }))),
  )

  return (
    <ComposerEditor
      controller={props.model}
      disabled={props.model.disabled()}
      class="mx-auto max-w-[1120px]"
      alternateKeybind={[IS_MAC ? "⌘" : language.t("common.key.ctrl"), "↵"]}
      labels={{
        empty:
          props.model.suggestionStatus() === "loading"
            ? language.t("common.loading")
            : props.model.suggestionStatus() === "failed"
              ? language.t("prompt.suggestions.loadFailed")
              : language.t("ui.promptInput.noMatchingItems"),
        dropFiles: language.t("prompt.dropzone.label"),
        removeAttachment: language.t("prompt.removeAttachment.generic"),
        prompt: language.t("prompt.message.aria"),
        add: language.t("ui.promptInput.add"),
        attach: language.t("prompt.attachFiles"),
        chooseModel: language.t("model.aria"),
        send: language.t("prompt.send"),
        stop: language.t("prompt.stop"),
      }}
      agentControl={
        <span class="flex h-7 shrink-0 items-center rounded-sm px-2 text-[13px] font-[440] leading-5 text-v2-text-text-muted">
          {props.model.agent}
        </span>
      }
      modelControl={
        <Show when={props.model.model.status !== "loading"}>
          <ModelSelectorPopover
            model={props.model.model.selection}
            onClose={props.model.restoreFocus}
            trigger={(triggerProps) => (
              <Button
                {...triggerProps}
                variant="ghost-muted"
                size="normal"
                disabled={modelDisabled()}
                class="min-w-0 max-w-[220px] justify-start ![font-weight:440] group"
                data-action="prompt-model"
                aria-label={language.t("model.aria")}
                aria-keyshortcuts="F2 Shift+F2"
                title={language.t("model.cycle.hint")}
              >
                <Show when={selectedModel()?.provider}>
                  {(provider) => <ProviderModelIcon provider={provider()} class="size-4 shrink-0 opacity-60" />}
                </Show>
                <span class="truncate">{modelName()}</span>
                <span class="-ml-0.5 -mr-1 flex shrink-0">
                  <Icon name="chevron-down" size="small" class="text-v2-icon-icon-muted" />
                </span>
              </Button>
            )}
          />
        </Show>
      }
    />
  )
}
