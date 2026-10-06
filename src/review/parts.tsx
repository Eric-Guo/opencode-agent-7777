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
  const modes: ChangeMode[] = ["turn", "working", "branch", "committed"]
  const hasBase = () => ["branch", "committed"].includes(props.review.state.source.mode)

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
      <Show when={hasBase()}>
        <form
          class="flex min-w-0 flex-1 basis-64 items-center gap-2 sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault()
            void props.review.select({ mode: props.review.state.source.mode, base: form.base })
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

export function ReviewDescription(props: { review: ReviewModel }) {
  const language = useLanguage()
  const keys = {
    turn: "review.description",
    working: "review.description.working",
    branch: "review.description.branch",
    committed: "review.description.committed",
  } as const satisfies Record<ChangeMode, string>

  return (
    <p class="break-words text-12-regular text-text-weak">
      {language.t(keys[props.review.state.source.mode], {
        base: props.review.state.source.base ?? language.t("review.base.default"),
      })}
    </p>
  )
}

export function ReviewEmpty(props: { review: ReviewModel }) {
  const language = useLanguage()

  return (
    <div class="p-6 text-center text-13-regular text-text-weak" role="status">
      {props.review.state.source.mode === "turn"
        ? language.t("review.empty")
        : language.t(`review.empty.${props.review.state.source.mode}`)}
    </div>
  )
}
