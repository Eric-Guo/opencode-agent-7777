import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"

function Mark(props: { multiple: boolean; picked: boolean }) {
  return (
    <span
      class="flex size-4 shrink-0 items-center justify-center rounded border border-v2-border-border-base bg-v2-background-bg-base text-[10px] text-v2-text-text-contrast"
      classList={{
        "rounded-full": !props.multiple,
        "bg-v2-background-bg-accent border-v2-background-bg-accent": props.picked,
      }}
      aria-hidden="true"
    >
      <Show when={props.picked}>
        <Show when={props.multiple} fallback={<span class="size-1.5 rounded-full bg-v2-text-text-contrast" />}>
          <Icon name="check-small" size="small" />
        </Show>
      </Show>
    </span>
  )
}

export function SessionQuestionDock(props: {
  request: QuestionRequest
  responding: boolean
  onReply: (answers: QuestionAnswer[]) => void
  onReject: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({
    tab: 0,
    answers: [] as QuestionAnswer[],
    custom: [] as string[],
    customOn: [] as boolean[],
  })

  const questions = createMemo(() => props.request.questions)
  const total = createMemo(() => questions().length)
  const question = createMemo(() => questions()[store.tab])
  const options = createMemo(() => question()?.options ?? [])
  const multiple = createMemo(() => question()?.multiple === true)
  const last = createMemo(() => store.tab >= total() - 1)
  const customAnswer = createMemo(() => store.custom[store.tab] ?? "")
  const customPicked = createMemo(() => store.customOn[store.tab] === true)
  const summary = createMemo(() => {
    return language.t("session.question.progress", {
      current: Math.min(store.tab + 1, total()),
      total: total(),
    })
  })

  const picked = (label: string) => store.answers[store.tab]?.includes(label) ?? false
  const answered = (index: number) => {
    if ((store.answers[index]?.length ?? 0) > 0) return true
    return store.customOn[index] === true && (store.custom[index] ?? "").trim().length > 0
  }

  const setCustom = (value: string) => {
    const previous = customAnswer().trim()
    setStore("custom", store.tab, value)
    if (!customPicked()) return

    const next = value.trim()
    if (!multiple()) {
      setStore("answers", store.tab, next ? [next] : [])
      return
    }

    setStore("answers", store.tab, (current = []) => {
      const withoutPrevious = current.filter((item) => item !== previous)
      if (!next) return withoutPrevious
      if (withoutPrevious.includes(next)) return withoutPrevious
      return [...withoutPrevious, next]
    })
  }

  const select = (label: string) => {
    if (props.responding) return

    if (!multiple()) {
      setStore("answers", store.tab, [label])
      setStore("customOn", store.tab, false)
      return
    }

    setStore("answers", store.tab, (current = []) => {
      if (current.includes(label)) return current.filter((item) => item !== label)
      return [...current, label]
    })
  }

  const toggleCustom = () => {
    if (props.responding) return

    if (!multiple()) {
      setStore("customOn", store.tab, true)
      setCustom(customAnswer())
      return
    }

    const next = !customPicked()
    setStore("customOn", store.tab, next)
    const value = customAnswer().trim()
    if (next && value) {
      setStore("answers", store.tab, (current = []) => (current.includes(value) ? current : [...current, value]))
      return
    }
    if (!next && value) {
      setStore("answers", store.tab, (current = []) => current.filter((item) => item !== value))
    }
  }

  const submit = () => {
    props.onReply(questions().map((_, index) => store.answers[index] ?? []))
  }

  const next = () => {
    if (props.responding) return
    if (last()) {
      submit()
      return
    }
    setStore("tab", store.tab + 1)
  }

  return (
    <section
      class="mx-auto mb-3 max-w-[1120px] rounded-xl border border-v2-border-border-active bg-v2-background-bg-layer-02 p-3.5 shadow-[var(--v2-elevation-raised)] max-[720px]:mb-2.5"
      aria-label={language.t("ui.tool.questions")}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="m-0 text-sm font-[760] leading-[1.3] text-v2-text-text-base">{summary()}</h2>
          <p class="m-0 mt-1 text-[13px] leading-[1.45] text-v2-text-text-muted">{question()?.question}</p>
        </div>
        <Show when={total() > 1}>
          <div class="flex shrink-0 gap-1 pt-0.5">
            <For each={questions()}>
              {(_, index) => (
                <button
                  type="button"
                  class="h-2.5 w-7 rounded-full border border-v2-border-border-base bg-v2-background-bg-base disabled:opacity-60"
                  classList={{
                    "bg-v2-background-bg-accent border-v2-background-bg-accent": index() === store.tab,
                    "border-v2-text-text-accent": answered(index()),
                  }}
                  disabled={props.responding}
                  aria-label={`${language.t("ui.tool.questions")} ${index() + 1}`}
                  onClick={() => setStore("tab", index())}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="mt-3 text-[12px] font-[560] text-v2-text-text-faint">
        <Show when={multiple()} fallback={language.t("ui.question.singleHint")}>
          {language.t("ui.question.multiHint")}
        </Show>
      </div>

      <div class="mt-2 grid gap-2" role={multiple() ? "group" : "radiogroup"}>
        <For each={options()}>
          {(option) => (
            <button
              type="button"
              class="flex min-h-10 w-full items-start gap-2 rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2 text-left text-[13px] leading-[1.35] text-v2-text-text-base hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover disabled:opacity-55"
              classList={{ "border-v2-background-bg-accent": picked(option.label) }}
              role={multiple() ? "checkbox" : "radio"}
              aria-checked={picked(option.label)}
              disabled={props.responding}
              onClick={() => select(option.label)}
            >
              <Mark multiple={multiple()} picked={picked(option.label)} />
              <span class="min-w-0">
                <span class="block font-[650]">{option.label}</span>
                <Show when={option.description}>
                  <span class="mt-0.5 block text-[12px] text-v2-text-text-muted">{option.description}</span>
                </Show>
              </span>
            </button>
          )}
        </For>

        <label
          class="flex min-h-10 w-full items-start gap-2 rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2 text-left text-[13px] leading-[1.35] text-v2-text-text-base"
          classList={{ "border-v2-background-bg-accent": customPicked() }}
        >
          <button
            type="button"
            class="mt-0.5 border-0 bg-transparent p-0"
            disabled={props.responding}
            role={multiple() ? "checkbox" : "radio"}
            aria-checked={customPicked()}
            onClick={toggleCustom}
          >
            <Mark multiple={multiple()} picked={customPicked()} />
          </button>
          <span class="min-w-0 flex-1">
            <span class="block font-[650]">{language.t("ui.messagePart.option.typeOwnAnswer")}</span>
            <textarea
              class="mt-1 block min-h-8 w-full resize-y rounded-md border border-v2-border-border-base bg-v2-background-bg-deep px-2 py-1.5 text-[13px] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-active disabled:opacity-55"
              rows={1}
              value={customAnswer()}
              placeholder={language.t("ui.question.custom.placeholder")}
              disabled={props.responding}
              onFocus={() => {
                if (!customPicked()) toggleCustom()
              }}
              onInput={(event) => setCustom(event.currentTarget.value)}
            />
          </span>
        </label>
      </div>

      <div class="mt-3.5 flex justify-between gap-2 max-[720px]:flex-wrap">
        <button
          type="button"
          class="min-h-8 rounded-lg border border-v2-border-border-base bg-v2-background-bg-button-neutral px-3 text-[13px] font-[680] text-v2-text-text-base hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover disabled:opacity-55"
          disabled={props.responding}
          onClick={props.onReject}
        >
          {language.t("ui.common.dismiss")}
        </button>
        <div class="flex gap-2">
          <Show when={store.tab > 0}>
            <button
              type="button"
              class="min-h-8 rounded-lg border border-v2-border-border-base bg-v2-background-bg-button-neutral px-3 text-[13px] font-[680] text-v2-text-text-base hover:enabled:border-v2-border-border-strong hover:enabled:bg-v2-overlay-simple-overlay-hover disabled:opacity-55"
              disabled={props.responding}
              onClick={() => setStore("tab", store.tab - 1)}
            >
              {language.t("ui.common.back")}
            </button>
          </Show>
          <button
            type="button"
            class="min-h-8 rounded-lg border border-v2-border-border-base bg-v2-background-bg-accent px-3 text-[13px] font-[680] text-v2-text-text-contrast hover:enabled:bg-[var(--v2-text-text-accent-hover)] disabled:opacity-55"
            disabled={props.responding}
            onClick={next}
          >
            {last() ? language.t("ui.common.submit") : language.t("ui.common.next")}
          </button>
        </div>
      </div>
    </section>
  )
}
