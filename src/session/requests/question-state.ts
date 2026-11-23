import { createMemo, createSignal } from "solid-js"
import {
  createQuestionDraft,
  customPicked,
  questionAnswer,
  questionAnswered,
  transitionQuestion,
  type QuestionEvent,
  type QuestionPromptQuestion,
} from "./question-machine"

export type { QuestionPromptQuestion } from "./question-machine"

export function createQuestionState(input: {
  questions: () => readonly QuestionPromptQuestion[]
  responding: () => boolean
  onReply: (answer: Record<string, string | string[]>) => void
  onFocus: (index: number) => void
}) {
  const [state, setState] = createSignal(createQuestionDraft())
  const question = createMemo(() => input.questions()[state().tab])
  const answer = () => questionAnswer(state())
  const send = (event: QuestionEvent) => {
    if (input.responding()) return
    const next = transitionQuestion(state(), event, input.questions())
    setState(next.state)
    if (next.focus) input.onFocus(next.state.focus)
    if (next.reply) input.onReply(next.reply)
  }

  return {
    get state() {
      return state()
    },
    question,
    options: () => question()?.options ?? [],
    total: () => input.questions().length,
    last: () => state().tab >= input.questions().length - 1,
    multiple: () => question()?.multiple === true,
    customValue: () => answer().custom,
    customSelected: () => customPicked(answer()),
    answered: (index: number) => questionAnswered(questionAnswer(state(), index)),
    picked: (value: string) => answer().picks.includes(value),
    trackFocus: (index: number) => send({ type: "focus.tracked", index }),
    focus: (index: number) => send({ type: "focus", index }),
    moveFocus: (step: number) => send({ type: "focus", index: state().focus + step }),
    selectOption: (value: string) => send({ type: "option", value }),
    updateCustom: (value: string) => send({ type: "custom.input", value }),
    openCustom: () => send({ type: "custom.open" }),
    closeCustom: () => send({ type: "custom.close" }),
    toggleCustom: () => send({ type: "custom.toggle" }),
    jump: (tab: number) => send({ type: "jump", tab }),
    next: () => send({ type: "next" }),
    back: () => send({ type: "jump", tab: state().tab - 1 }),
  }
}
