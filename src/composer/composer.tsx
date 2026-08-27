import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, Show } from "solid-js"
import { DialogManageModelsV2 } from "@/providers/models/manage"
import { ModelSelectorPopoverV2 } from "@/providers/models/select-dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { ComposerEditor } from "./editor/editor"
import type { ComposerModel } from "./model"

export function Composer(props: { model: ComposerModel }) {
  const language = useLanguage()
  const dialog = useDialog()
  const selectedModel = createMemo(() => props.model.model.selection.current())
  const modelName = createMemo(() => {
    if (props.model.model.status === "loading") return language.t("model.loading")
    return selectedModel()?.name ?? language.t("dialog.model.select.title")
  })
  const modelDisabled = createMemo(
    () =>
      props.model.disabled() ||
      props.model.model.status !== "ready" ||
      !props.model.model.selection
        .list()
        .some((item) => props.model.model.selection.visible({ modelID: item.id, providerID: item.provider.id })),
  )

  return (
    <ComposerEditor
      controller={props.model}
      disabled={props.model.disabled()}
      class="mx-auto max-w-[1120px]"
      labels={{
        dropFiles: language.t("prompt.dropzone.label"),
        removeAttachment: language.t("prompt.removeAttachment.generic"),
        prompt: language.t("prompt.message.aria"),
        add: language.t("prompt.attachFiles"),
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
          <ModelSelectorPopoverV2
            model={props.model.model.selection}
            triggerAs={Button}
            triggerProps={{
              variant: "ghost-muted",
              size: "normal",
              disabled: modelDisabled(),
              class: "min-w-0 max-w-[220px] justify-start ![font-weight:440] group",
              "data-action": "prompt-model",
              "aria-label": language.t("model.aria"),
            }}
            onManage={() => dialog.show(() => <DialogManageModelsV2 model={props.model.model.selection} />)}
          >
            <Show when={selectedModel()?.provider.id}>
              {(providerID) => <ProviderIcon id={providerID()} class="size-4 shrink-0 opacity-60" />}
            </Show>
            <span class="truncate">{modelName()}</span>
            <span class="-ml-0.5 -mr-1 flex shrink-0">
              <Icon name="chevron-down" size="small" class="text-v2-icon-icon-muted" />
            </span>
          </ModelSelectorPopoverV2>
        </Show>
      }
    />
  )
}
