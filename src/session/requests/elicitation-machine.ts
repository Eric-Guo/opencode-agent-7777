import type { FormField, FormMultiselectField, FormValue, FormWhen } from "@opencode/client/promise"

// Edits overlay the server defaults. A cleared field keeps its empty edit, including an empty number input.
export type ElicitationDraft = ReadonlyMap<string, FormValue>

export function elicitationValue(draft: ElicitationDraft, field: FormField) {
  return draft.get(field.key) ?? ("default" in field ? field.default : undefined)
}

export function elicitationSelection(draft: ElicitationDraft, field: FormMultiselectField) {
  const value = elicitationValue(draft, field)
  return Array.isArray(value) ? value : []
}

export type ElicitationEdit =
  | { type: "set"; field: FormField; value: FormValue }
  | { type: "toggle"; field: FormMultiselectField; option: string; checked: boolean }

export function editElicitationDraft(draft: ElicitationDraft, edit: ElicitationEdit): ElicitationDraft {
  const next = new Map(draft)
  if (edit.type === "set") return next.set(edit.field.key, edit.value)
  const selected = elicitationSelection(draft, edit.field)
  return next.set(edit.field.key, edit.checked ? [...selected, edit.option] : selected.filter((v) => v !== edit.option))
}

function matches(when: FormWhen, value: FormValue | undefined) {
  if (value === undefined) return false
  const equal = Array.isArray(value) ? value.some((item) => item === when.value) : value === when.value
  return when.op === "eq" ? equal : !equal
}

export function projectElicitation(fields: readonly FormField[], draft: ElicitationDraft) {
  const visible: FormField[] = []
  const answers = new Map<string, FormValue>()
  let complete = true
  for (const field of fields) {
    if (field.type === "external") {
      visible.push(field)
      answers.set(field.key, true)
      continue
    }
    // Conditions see only the typed answers contributed by preceding, visible fields.
    if (field.hidden || field.when?.some((when) => !matches(when, answers.get(when.key)))) continue
    visible.push(field)
    if (field.type === "multiselect") {
      const selected = elicitationSelection(draft, field)
      if (selected.length) {
        answers.set(field.key, [...selected])
        if (selected.length < (field.minItems ?? 0) || selected.length > (field.maxItems ?? Infinity)) complete = false
      } else if (field.required) complete = false
      continue
    }
    const raw = elicitationValue(draft, field)
    if (field.type === "boolean") {
      answers.set(field.key, raw === true)
    } else if (raw === undefined || raw === "") {
      if (field.required) complete = false
    } else if (field.type === "string") {
      answers.set(field.key, String(raw))
    } else {
      const number = Number(raw)
      if (Number.isFinite(number)) answers.set(field.key, number)
      else complete = false
    }
  }
  return { fields: visible, answer: Object.fromEntries(answers), complete }
}
