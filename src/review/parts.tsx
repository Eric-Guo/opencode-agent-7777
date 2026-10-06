import { Button } from "@opencode/ui/button"
import { Select } from "@opencode/ui/select"
import { TextInput } from "@opencode/ui/text-input"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import type { ChangeMode, ReviewModel } from "./model"

// The extension owns the same title/control boundary; the compact dialog supplies its local model.
export function ReviewTitle(props: { review: ReviewModel }) {
  const language = useLanguage()
  const [form, setForm] = createStore({ base: "" })
  const modes: ChangeMode[] = ["turn", "working", "branch"]

  return (
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        options={modes}
        current={props.review.state.source.mode}
        label={(mode) => language.t(`review.mode.${mode}`)}
        aria-label={language.t("review.mode.label")}
        placement="bottom-start"
        onSelect={(mode) => mode && void props.review.select({ mode, base: form.base })}
      />
      <Show when={props.review.state.source.mode === "branch"}>
        <form
          class="flex min-w-0 flex-1 basis-64 items-center gap-2 sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault()
            void props.review.select({ mode: "branch", base: form.base })
          }}
        >
          <TextInput
            class="min-w-0 !w-0 !flex-1"
            aria-label={language.t("review.base.label")}
            placeholder={language.t("review.base.default")}
            value={form.base}
            onInput={(event) => setForm("base", event.currentTarget.value)}
          />
          <Button type="submit" variant="neutral" size="small">
            {language.t("review.base.apply")}
          </Button>
        </form>
      </Show>
    </div>
  )
}
