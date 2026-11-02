import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"

export type QuestionPromptQuestion = {
  key: string
  question: string
  options: readonly { value: string; label: string; description?: string }[]
  multiple?: boolean
}

type Answer = { values: string[]; custom: string; customOn: boolean }

// Each mounted request owns its answers. Keep custom text with its selection and values,
// without sharing a reset object or retaining another request in a global draft cache.
export function createQuestionState(input: {
  questions: () => readonly QuestionPromptQuestion[]
  responding: () => boolean
  onReply: (answer: Record<string, string | string[]>) => void
  onFocus: (index: number) => void
}) {
  const [state, setState] = createStore({ tab: 0, answers: [] as Answer[], editing: false, focus: 0 })
  const answer = (index = state.tab): Answer => state.answers[index] ?? { values: [], custom: "", customOn: false }
  const update = (change: (current: Answer) => Answer) => setState("answers", state.tab, change(answer()))
  const total = createMemo(() => input.questions().length)
  const question = createMemo(() => input.questions()[state.tab])
  const options = createMemo(() => question()?.options ?? [])
  const multiple = createMemo(() => question()?.multiple === true)
  const customValue = createMemo(() => answer().custom)
  const customSelected = createMemo(() => answer().customOn)
  const last = createMemo(() => state.tab >= total() - 1)

  const focus = (index: number) => {
    const next = Math.max(0, Math.min(options().length, index))
    setState("focus", next)
    if (!state.editing) input.onFocus(next)
  }
  const pickFocus = (tab: number) => {
    const list = input.questions()[tab]?.options ?? []
    const current = answer(tab)
    if (current.customOn) return list.length
    return Math.max(
      0,
      list.findIndex((item) => current.values.includes(item.value)),
    )
  }
  const updateCustom = (value: string, selected = customSelected()) => {
    update((current) => {
      const previous = current.custom.trim()
      const next = value.trim()
      let values = current.values
      if (selected) {
        if (multiple()) {
          values = previous ? values.filter((item) => item.trim() !== previous) : values
          if (next && !values.some((item) => item.trim() === next)) values = [...values, next]
        } else {
          values = next ? [next] : []
        }
      }
      return { ...current, custom: value, values }
    })
  }
  const openCustom = () => {
    if (input.responding()) return
    setState({ focus: options().length, editing: true })
    update((current) => ({ ...current, customOn: true }))
    updateCustom(customValue(), true)
  }
  const closeCustom = () => {
    setState("editing", false)
    focus(options().length)
  }
  const commitCustom = () => {
    setState("editing", false)
    updateCustom(customValue())
    focus(options().length)
  }
  const jump = (tab: number) => {
    if (input.responding()) return
    setState({ tab, editing: false })
    focus(pickFocus(tab))
  }
  const submit = () =>
    input.onReply(
      Object.fromEntries(
        input.questions().flatMap((question, index) => {
          const values = answer(index).values
          return values.length ? [[question.key, question.multiple ? values : values[0]]] : []
        }),
      ),
    )

  return {
    state,
    question,
    options,
    total,
    last,
    multiple,
    customValue,
    customSelected,
    answered(index: number) {
      const current = answer(index)
      return current.values.length > 0 || (current.customOn && current.custom.trim().length > 0)
    },
    picked: (value: string) => answer().values.includes(value),
    trackFocus: (index: number) => setState("focus", index),
    focus,
    moveFocus(step: number) {
      if (!state.editing && !input.responding()) focus(state.focus + step)
    },
    selectOption(index: number) {
      if (input.responding()) return
      if (index === options().length) return openCustom()
      const option = options()[index]
      if (!option) return
      update((current) => ({
        ...current,
        values: multiple()
          ? current.values.includes(option.value)
            ? current.values.filter((value) => value !== option.value)
            : [...current.values, option.value]
          : [option.value],
        customOn: multiple() && current.customOn,
      }))
      setState("editing", false)
    },
    updateCustom,
    openCustom,
    closeCustom,
    commitCustom,
    toggleCustom() {
      if (input.responding()) return
      if (!multiple() || !customSelected()) return openCustom()
      setState("focus", options().length)
      update((current) => ({
        ...current,
        customOn: false,
        values: current.custom.trim()
          ? current.values.filter((value) => value.trim() !== current.custom.trim())
          : current.values,
      }))
      closeCustom()
    },
    jump,
    next() {
      if (input.responding()) return
      if (state.editing) commitCustom()
      if (last()) return submit()
      jump(state.tab + 1)
    },
    back() {
      if (state.tab > 0) jump(state.tab - 1)
    },
  }
}
