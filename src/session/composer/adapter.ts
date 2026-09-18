import { createMemo, type Accessor } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { currentLocalAgent, setState, state } from "@/runtime/server/session-store-compact"
import { prompt } from "@/composer/persistence-singleton"
import { abortPrompt, submitPrompt } from "@/composer/submit"
import type { ComposerAdapter, ComposerControls } from "@/composer/adapter"

export function createActiveComposerAdapter(input: {
  controls: Accessor<ComposerControls>
  disabled: Accessor<boolean>
}): ComposerAdapter {
  const language = useLanguage()
  return {
    state: prompt,
    identity: () => state.session?.id,
    controls: input.controls,
    disabled: input.disabled,
    working: createMemo(() => state.submitting || state.sessionStatus.type !== "idle"),
    submitting: () => state.submitting,
    placeholder: () => language.t("prompt.placeholder", { agent: currentLocalAgent() }),
    onAttachmentError: (message: string) => setState("error", message),
    submit: submitPrompt,
    interrupt: abortPrompt,
  }
}
