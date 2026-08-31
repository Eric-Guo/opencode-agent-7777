import { useLanguage } from "@/runtime/i18n/language"
import { currentLocalAgent, state } from "@/runtime/server/session-store-compact"
import { prompt } from "@/composer/persistence-singleton"
import type { ComposerAdapter } from "@/composer/adapter"
import type { SessionComposerRegionController } from "./session-composer-region-controller"

export function createActiveComposerAdapter(controller: SessionComposerRegionController): ComposerAdapter {
  const language = useLanguage()
  return {
    state: prompt,
    identity: () => state.session?.id,
    controls: () => ({
      agent: currentLocalAgent(),
      model: { selection: controller.model, status: controller.modelStatus() },
    }),
    disabled: controller.disabled,
    working: controller.busy,
    placeholder: () => language.t("prompt.placeholder", { agent: currentLocalAgent() }),
    onAttachmentError: controller.setAttachmentError,
    submit: controller.submitPrompt,
    interrupt: controller.abortPrompt,
  }
}
