import type { OpenCodeClient } from "@opencode/client/promise"
import { setState, state } from "@/runtime/server/session-store-compact"
import { captureSessionOwnership } from "@/session/session-ownership"
import { readableError } from "@/shell/errors/readable"
import { bounded } from "@/runtime/server/operation"
import { createRequestListState, transitionRequestList, type RequestListState } from "./list-machine"
import {
  createReplyState,
  transitionReply,
  requestSettled,
  respondingRequest,
  type RequestKey,
  type ReplyEvent,
} from "./reply-machine"

type Kind = "permission" | "form"
type Owner = NonNullable<ReturnType<typeof captureSessionOwnership>>["runtime"]
const replies = new WeakMap<Owner, Record<Kind, ReturnType<typeof createReplyState>>>()
const lists = new WeakMap<Owner, Record<Kind, RequestListState>>()
function listMachines(owner: Owner) {
  let value = lists.get(owner)
  if (!value) {
    value = { permission: createRequestListState(), form: createRequestListState() }
    lists.set(owner, value)
  }
  return value
}
export function rememberRequest(kind: Kind, request: RequestKey) {
  const active = captureSessionOwnership()
  if (!active) return
  const value = listMachines(active.runtime)
  value[kind] = transitionRequestList(value[kind], { type: "updated", request })
}
export async function readSessionRequests<T extends RequestKey>(
  kind: Kind,
  read: (signal: AbortSignal) => Promise<T[]>,
) {
  const active = captureSessionOwnership()
  if (!active) return
  const value = listMachines(active.runtime)
  value[kind] = transitionRequestList(value[kind], { type: "started" })
  const attempt = value[kind].attempt
  try {
    const requests = await bounded(read, { signal: active.runtime.signal })
    const snapshot = value[kind]
    if (!active.current() || snapshot.status !== "loading" || snapshot.attempt !== attempt) return
    // Updates retain the complete wire objects; kind-specific adapters keep the two catalogs separate.
    const updated = snapshot.updates as T[]
    const merged = [
      ...updated,
      ...requests.filter((item) => !updated.some((next) => next.id === item.id && next.sessionID === item.sessionID)),
    ]
    return filterSettledRequests(kind, merged)
  } catch (error) {
    if (active.current() && value[kind].attempt === attempt) throw error
  } finally {
    value[kind] = transitionRequestList(value[kind], { type: "finished", attempt })
  }
}
function machines(owner: Owner) {
  let value = replies.get(owner)
  if (!value) {
    value = { permission: createReplyState(), form: createReplyState() }
    replies.set(owner, value)
  }
  return value
}
function dispatch(owner: Owner, kind: Kind, event: ReplyEvent) {
  const value = machines(owner)
  value[kind] = transitionReply(value[kind], event)
  setState(kind === "permission" ? "permissionResponding" : "questionResponding", respondingRequest(value[kind]))
  return value[kind]
}
export function settleRequest(kind: Kind, request: RequestKey) {
  const active = captureSessionOwnership()
  if (active) dispatch(active.runtime, kind, { type: "resolved", request })
}
export function filterSettledRequests<T extends RequestKey>(kind: Kind, requests: T[]) {
  const active = captureSessionOwnership()
  return active ? requests.filter((request) => !requestSettled(machines(active.runtime)[kind], request)) : requests
}
export function groupSessionRequests<T extends { sessionID: string }>(requests: T[]) {
  return requests.reduce<Record<string, T[]>>((result, request) => {
    ;(result[request.sessionID] ??= []).push(request)
    return result
  }, {})
}

export function respondToRequest(
  kind: Kind,
  request: RequestKey,
  send: (client: OpenCodeClient, signal: AbortSignal) => Promise<void>,
) {
  const active = captureSessionOwnership()
  if (!active) return
  const previous = machines(active.runtime)[kind]
  const next = dispatch(active.runtime, kind, { type: "send", request })
  if (next === previous) return
  const attempt = next.attempt
  setState("error", "")
  void bounded((signal) => send(active.client, signal), {
    signal: active.runtime.signal,
    timeoutMs: kind === "permission" ? 15_000 : 30_000,
  })
    .then(() => {
      if (
        !active.current() ||
        machines(active.runtime)[kind].reply.status !== "responding" ||
        machines(active.runtime)[kind].attempt !== attempt
      )
        return
      dispatch(active.runtime, kind, { type: "succeeded", attempt })
      if (kind === "permission")
        setState("permission", request.sessionID, (items = []) => items.filter((item) => item.id !== request.id))
      else setState("form", request.sessionID, (items = []) => items.filter((item) => item.id !== request.id))
      active.runtime.schedule(120)
    })
    .catch((error) => {
      if (!active.current()) return
      const previous = machines(active.runtime)[kind]
      const next = dispatch(active.runtime, kind, { type: "failed", attempt })
      if (next !== previous) {
        setState("error", readableError(error))
        active.runtime.schedule(0)
      }
    })
}
