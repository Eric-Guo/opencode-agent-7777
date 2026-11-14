import { createSignal } from "solid-js"
import { setState, state } from "./session-store-compact"
import { readableError } from "@/shell/errors/readable"

type ReadFailure = { readonly owner: object; readonly error: string; readonly retry: () => void }
const [failures, setFailures] = createSignal<readonly ReadFailure[]>([])
export const readRetry = () => failures().findLast((item) => item.error === state.error)?.retry
export function clearReadError(owner: object) {
  const previous = failures().find((item) => item.owner === owner)
  const visible = failures().at(-1) === previous
  setFailures((items) => items.filter((item) => item.owner !== owner))
  if (previous && visible && state.error === previous.error) setState("error", "")
}
export function reportReadError(owner: object, error: unknown, retry: () => void) {
  const message = readableError(error)
  setFailures((items) => [...items.filter((item) => item.owner !== owner), { owner, error: message, retry }])
  setState("error", message)
}
