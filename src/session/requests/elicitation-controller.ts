import type { FormField, FormInfo, FormMultiselectField, FormValue } from "@opencode/client/promise"
import { createMemo, createSignal } from "solid-js"
import {
  editElicitationDraft,
  elicitationSelection,
  elicitationValue,
  projectElicitation,
  type ElicitationDraft,
  type ElicitationEdit,
} from "./elicitation-machine"

export type ElicitationDrafts = WeakMap<FormInfo, ElicitationDraft>

export function createElicitationDock(request: FormInfo, drafts: ElicitationDrafts) {
  const [draft, setDraft] = createSignal<ElicitationDraft>(drafts.get(request) ?? new Map())
  function edit(change: ElicitationEdit) {
    const next = editElicitationDraft(draft(), change)
    drafts.set(request, next)
    setDraft(next)
  }
  return {
    view: createMemo(() => projectElicitation(request.fields, draft())),
    value: (field: FormField) => elicitationValue(draft(), field),
    selected: (field: FormMultiselectField) => elicitationSelection(draft(), field),
    set: (field: FormField, value: FormValue) => edit({ type: "set", field, value }),
    toggle: (field: FormMultiselectField, option: string, checked: boolean) =>
      edit({ type: "toggle", field, option, checked }),
  }
}
