import type { FormField, FormInfo, FormValue, FormWhen } from "@opencode/client/promise"
import { createMemo, createSignal } from "solid-js"

// Keep number inputs as text until submission. An empty edit must override a server default.
type Edits = ReadonlyMap<string, FormValue>
export type ElicitationDrafts = WeakMap<FormInfo, Edits>

function matches(when: FormWhen, value: FormValue | undefined) {
  if (value === undefined) return false
  const equal = Array.isArray(value) ? value.some((item) => item === when.value) : value === when.value
  return when.op === "eq" ? equal : !equal
}

export function createElicitationDock(request: FormInfo, drafts: ElicitationDrafts) {
  const [edits, setEdits] = createSignal<Edits>(drafts.get(request) ?? new Map())
  function set(field: FormField, value: FormValue) {
    const next = new Map(edits()).set(field.key, value)
    drafts.set(request, next)
    setEdits(next)
  }
  const value = (field: FormField) => edits().get(field.key) ?? ("default" in field ? field.default : undefined)
  const selected = (field: FormField) => {
    const list = value(field)
    return Array.isArray(list) ? list : []
  }
  const view = createMemo(() => {
    const fields: FormField[] = []
    const answers = new Map<string, FormValue>()
    let complete = true
    for (const field of request.fields) {
      if (field.type === "external") {
        fields.push(field)
        answers.set(field.key, true)
        continue
      }
      if (field.hidden || (field.when && !field.when.every((when) => matches(when, answers.get(when.key))))) continue
      fields.push(field)
      const raw = value(field)
      if (field.type === "boolean") {
        answers.set(field.key, raw === true)
      } else if (field.type === "multiselect") {
        const options = selected(field)
        if (options.length) {
          answers.set(field.key, [...options])
          if (options.length < (field.minItems ?? 0) || options.length > (field.maxItems ?? Infinity)) complete = false
        } else if (field.required) complete = false
      } else if (raw === undefined || raw === "") {
        if (field.required) complete = false
      } else if (field.type === "string") {
        answers.set(field.key, String(raw))
      } else if (Number.isFinite(Number(raw))) {
        answers.set(field.key, Number(raw))
      } else complete = false
    }
    return { fields, answer: Object.fromEntries(answers), complete }
  })
  return { view, value, selected, set }
}
