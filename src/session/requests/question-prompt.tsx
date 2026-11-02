import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { For, Show, onCleanup, type Component } from "solid-js"
import { useI18n } from "@opencode/ui/context/i18n"

import { questionKey } from "./question-keys"
import { createQuestionState, type QuestionPromptQuestion } from "./question-state"

export type { QuestionPromptQuestion } from "./question-state"

export type QuestionPromptProps = {
  questions: readonly QuestionPromptQuestion[]
  responding: boolean
  progress: (current: number, total: number) => string
  onReply: (answer: Record<string, string | string[]>) => void
  onReject: () => void
}

function Mark(props: { multi: boolean; picked: boolean; onClick?: (event: MouseEvent) => void }) {
  return (
    <span data-slot="question-option-check" aria-hidden="true" onClick={props.onClick}>
      <span data-slot="question-option-box" data-type={props.multi ? "checkbox" : "radio"} data-picked={props.picked}>
        <Show when={props.multi} fallback={<span data-slot="question-option-radio-dot" />}>
          <Icon name="check-small" size="small" />
        </Show>
      </span>
    </span>
  )
}

function Option(props: {
  multi: boolean
  picked: boolean
  label: string
  description?: string
  disabled: boolean
  ref?: (el: HTMLButtonElement) => void
  onFocus?: VoidFunction
  onClick: VoidFunction
}) {
  return (
    <button
      type="button"
      ref={props.ref}
      data-slot="question-option"
      data-picked={props.picked}
      role={props.multi ? "checkbox" : "radio"}
      aria-checked={props.picked}
      disabled={props.disabled}
      onFocus={props.onFocus}
      onClick={props.onClick}
    >
      <Mark multi={props.multi} picked={props.picked} />
      <span data-slot="question-option-main">
        <span data-slot="option-label">{props.label}</span>
        <Show when={props.description}>
          <span data-slot="option-description">{props.description}</span>
        </Show>
      </span>
    </button>
  )
}

// Mount a new prompt for each request so answers and focus belong to that request.
export const QuestionPrompt: Component<QuestionPromptProps> = (props) => {
  const i18n = useI18n()

  let customRef: HTMLButtonElement | undefined
  const optsRef: HTMLButtonElement[] = []
  let focusFrame: number | undefined
  let customTimer: ReturnType<typeof setTimeout> | undefined
  const model = createQuestionState({
    questions: () => props.questions,
    responding: () => props.responding,
    onReply: (answer) => props.onReply(answer),
    onFocus(index) {
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
      focusFrame = requestAnimationFrame(() => {
        focusFrame = undefined
        const element = index === model.options().length ? customRef : optsRef[index]
        element?.focus()
      })
    },
  })
  onCleanup(() => {
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
    clearTimeout(customTimer)
  })

  const summary = () => props.progress(Math.min(model.state.tab + 1, model.total()), model.total())
  const customLabel = () => i18n.t("ui.messagePart.option.typeOwnAnswer")
  const customPlaceholder = () => i18n.t("ui.question.custom.placeholder")
  const sending = () => props.responding

  const nav = (event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : undefined
    const zone = target?.closest('[data-slot="question-custom-input"]')
      ? "input"
      : target?.closest('[data-slot="question-options"]')
        ? "options"
        : "other"
    const intent = questionKey(event, { zone, editing: model.state.editing })
    if (!intent) return
    event.preventDefault()
    switch (intent.type) {
      case "dismiss":
        return props.onReject()
      case "advance":
        return model.next()
      case "commit":
        return model.commitCustom()
      case "close-custom":
        return model.closeCustom()
      case "move":
        return model.moveFocus(intent.step)
      case "edge":
        return model.focus(intent.to === "first" ? 0 : model.options().length)
    }
  }

  const resizeInput = (element: HTMLTextAreaElement) => {
    element.style.height = "0px"
    element.style.height = `${element.scrollHeight}px`
  }
  const focusCustom = (element: HTMLTextAreaElement) => {
    clearTimeout(customTimer)
    customTimer = setTimeout(() => {
      if (!element.isConnected) return
      element.focus()
      resizeInput(element)
    }, 0)
  }
  const toggleCustomMark = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    model.toggleCustom()
  }

  return (
    <DockPrompt
      kind="question"
      onKeyDown={nav}
      header={
        <>
          <div data-slot="question-header-title">{summary()}</div>
          <div data-slot="question-header-actions">
            <Show when={model.total() > 1}>
              <div data-slot="question-progress">
                <For each={props.questions}>
                  {(_, i) => (
                    <button
                      type="button"
                      data-slot="question-progress-segment"
                      data-active={i() === model.state.tab}
                      data-answered={model.answered(i())}
                      disabled={sending()}
                      onClick={() => model.jump(i())}
                      aria-label={`${i18n.t("ui.tool.questions")} ${i() + 1}`}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </>
      }
      footer={
        <>
          <Button type="button" variant="ghost" size="large" disabled={sending()} onClick={props.onReject}>
            {i18n.t("ui.common.dismiss")}
          </Button>
          <div data-slot="question-footer-actions">
            <Show when={model.state.tab > 0}>
              <Button type="button" variant="neutral" size="large" disabled={sending()} onClick={model.back}>
                {i18n.t("ui.common.back")}
              </Button>
            </Show>
            <Button
              type="button"
              variant={model.last() ? "contrast" : "neutral"}
              size="large"
              disabled={sending()}
              onClick={model.next}
            >
              {model.last() ? i18n.t("ui.common.submit") : i18n.t("ui.common.next")}
            </Button>
          </div>
        </>
      }
    >
      <div data-slot="question-text">{model.question()?.question}</div>
      <Show when={model.multiple()} fallback={<div data-slot="question-hint">{i18n.t("ui.question.singleHint")}</div>}>
        <div data-slot="question-hint">{i18n.t("ui.question.multiHint")}</div>
      </Show>
      <div data-slot="question-options">
        <For each={model.options()}>
          {(opt, i) => (
            <Option
              multi={model.multiple()}
              picked={model.picked(opt.value)}
              label={opt.label}
              description={opt.description}
              disabled={sending()}
              ref={(el) => (optsRef[i()] = el)}
              onFocus={() => model.trackFocus(i())}
              onClick={() => model.selectOption(i())}
            />
          )}
        </For>

        <Show
          when={model.state.editing}
          fallback={
            <button
              type="button"
              ref={customRef}
              data-slot="question-option"
              data-custom="true"
              data-picked={model.customSelected()}
              role={model.multiple() ? "checkbox" : "radio"}
              aria-checked={model.customSelected()}
              disabled={sending()}
              onFocus={() => model.trackFocus(model.options().length)}
              onClick={model.openCustom}
            >
              <Mark multi={model.multiple()} picked={model.customSelected()} onClick={toggleCustomMark} />
              <span data-slot="question-option-main">
                <span data-slot="option-label">{customLabel()}</span>
                <span data-slot="option-description">{model.customValue() || customPlaceholder()}</span>
              </span>
            </button>
          }
        >
          <div
            data-slot="question-option"
            data-custom="true"
            data-picked={model.customSelected()}
            role={model.multiple() ? "checkbox" : "radio"}
            aria-checked={model.customSelected()}
            onMouseDown={(event) => {
              if (sending()) {
                event.preventDefault()

                return
              }

              if (event.target instanceof HTMLTextAreaElement) return
              const input = event.currentTarget.querySelector('[data-slot="question-custom-input"]')

              if (input instanceof HTMLTextAreaElement) input.focus()
            }}
          >
            <Mark multi={model.multiple()} picked={model.customSelected()} onClick={toggleCustomMark} />
            <span data-slot="question-option-main">
              <span data-slot="option-label">{customLabel()}</span>
              <textarea
                ref={focusCustom}
                data-slot="question-custom-input"
                placeholder={customPlaceholder()}
                value={model.customValue()}
                rows={1}
                disabled={sending()}
                onInput={(event) => {
                  model.updateCustom(event.currentTarget.value)
                  resizeInput(event.currentTarget)
                }}
              />
            </span>
          </div>
        </Show>
      </div>
    </DockPrompt>
  )
}
