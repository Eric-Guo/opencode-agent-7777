export type QuestionPromptQuestion = {
  key: string
  question: string
  options: readonly { value: string; label: string; description?: string }[]
  multiple?: boolean
}

// A marker preserves the custom answer's place among the picks, even when its text matches an option.
const CUSTOM = Symbol("custom")
type Answer = { picks: readonly (string | typeof CUSTOM)[]; custom: string }
const EMPTY_ANSWER: Answer = Object.freeze({ picks: Object.freeze([]), custom: "" })

export type QuestionState = { tab: number; focus: number; editing: boolean; answers: readonly Answer[] }
export type QuestionEvent =
  | { type: "option"; value: string }
  | { type: "custom.open" | "custom.toggle" | "custom.close" }
  | { type: "custom.input"; value: string }
  | { type: "focus" | "focus.tracked"; index: number }
  | { type: "jump"; tab: number }
  | { type: "next" }

export function createQuestionDraft(): QuestionState {
  return { tab: 0, focus: 0, editing: false, answers: [] }
}

export function questionAnswer(state: QuestionState, tab = state.tab) {
  return state.answers[tab] ?? EMPTY_ANSWER
}

export function customPicked(answer: Answer) {
  return answer.picks.includes(CUSTOM)
}

function values(answer: Answer) {
  const custom = answer.custom.trim()
  const includeCustom = custom && !answer.picks.some((pick) => typeof pick === "string" && pick.trim() === custom)
  return answer.picks.flatMap((pick) => (pick !== CUSTOM ? [pick] : includeCustom ? [custom] : []))
}

export function questionAnswered(answer: Answer) {
  return answer.picks.some((pick) => pick !== CUSTOM || !!answer.custom.trim())
}

function setAnswer(state: QuestionState, answer: Answer): QuestionState {
  const answers = state.answers.slice()
  answers[state.tab] = answer
  return { ...state, answers }
}

type QuestionTransition = { state: QuestionState; focus?: boolean; reply?: Record<string, string | string[]> }

export function transitionQuestion(
  state: QuestionState,
  event: QuestionEvent,
  questions: readonly QuestionPromptQuestion[],
): QuestionTransition {
  const answer = questionAnswer(state)
  const question = questions[state.tab]
  const customIndex = question?.options.length ?? 0
  const multiple = question?.multiple
  switch (event.type) {
    case "option": {
      const picks = multiple ? answer.picks : []
      const selected = picks.includes(event.value)
      const next = selected ? picks.filter((pick) => pick !== event.value) : [...picks, event.value]
      return { state: setAnswer({ ...state, editing: false }, { ...answer, picks: next }) }
    }
    case "custom.open":
    case "custom.toggle": {
      const on = event.type === "custom.open" || !multiple || !customPicked(answer)
      const picks = multiple ? answer.picks.filter((pick) => pick !== CUSTOM) : []
      return {
        state: setAnswer(
          { ...state, editing: on, focus: customIndex },
          { ...answer, picks: on ? [...picks, CUSTOM] : picks },
        ),
        focus: !on,
      }
    }
    case "custom.input":
      return { state: setAnswer(state, { ...answer, custom: event.value }) }
    case "custom.close":
      return { state: { ...state, editing: false, focus: customIndex }, focus: true }
    case "focus":
    case "focus.tracked": {
      const focus = Math.max(0, Math.min(customIndex, event.index))
      return {
        state: focus === state.focus ? state : { ...state, focus },
        focus: event.type === "focus" && !state.editing,
      }
    }
    case "next":
    case "jump": {
      if (event.type === "next" && state.tab >= questions.length - 1) {
        const reply = Object.fromEntries(
          questions.flatMap((item, index) => {
            const picks = values(questionAnswer(state, index))
            return picks.length ? [[item.key, item.multiple ? picks : picks[0]]] : []
          }),
        )
        return {
          state: state.editing ? { ...state, editing: false, focus: customIndex } : state,
          focus: state.editing,
          reply,
        }
      }
      const tab = event.type === "jump" ? event.tab : state.tab + 1
      const target = questions[tab]
      if (!target) return { state }
      const draft = questionAnswer(state, tab)
      const focus = customPicked(draft)
        ? target.options.length
        : Math.max(
            0,
            target.options.findIndex((item) => draft.picks.includes(item.value)),
          )
      return { state: { ...state, tab, focus, editing: false }, focus: true }
    }
  }
}
