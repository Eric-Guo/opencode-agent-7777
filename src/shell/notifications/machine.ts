type Delivery = { readonly status: "pending"; readonly attempt: number } | { readonly status: "finished" }

export type NotificationState =
  | { readonly status: "active"; readonly attempt: number; readonly deliveries: ReadonlyMap<string, Delivery> }
  | { readonly status: "disposed" }

export type NotificationEvent =
  | { readonly type: "requested"; readonly key: string }
  | { readonly type: "finished"; readonly key: string; readonly attempt: number }
  | { readonly type: "forgotten"; readonly key: string }
  | { readonly type: "reset" }
  | { readonly type: "disposed" }

const FINISHED: Delivery = Object.freeze({ status: "finished" })
const DISPOSED: NotificationState = Object.freeze({ status: "disposed" })

export function createNotificationState(): NotificationState {
  return { status: "active", attempt: 0, deliveries: new Map() }
}

export function pendingNotification(state: NotificationState, key: string) {
  const delivery = state.status === "active" ? state.deliveries.get(key) : undefined
  return delivery?.status === "pending" ? delivery.attempt : undefined
}

export function transitionNotification(state: NotificationState, event: NotificationEvent): NotificationState {
  if (state.status === "disposed") return state
  if (event.type === "disposed") return DISPOSED
  if (event.type === "reset") {
    return state.deliveries.size ? { ...state, deliveries: new Map() } : state
  }
  if (event.type === "requested") {
    if (state.deliveries.has(event.key)) return state
    const attempt = state.attempt + 1
    const deliveries = new Map(state.deliveries)
    deliveries.set(event.key, { status: "pending", attempt })
    return { ...state, attempt, deliveries }
  }
  if (event.type === "forgotten") {
    if (!state.deliveries.has(event.key)) return state
    const deliveries = new Map(state.deliveries)
    deliveries.delete(event.key)
    return { ...state, deliveries }
  }
  if (pendingNotification(state, event.key) !== event.attempt) return state
  return { ...state, deliveries: new Map(state.deliveries).set(event.key, FINISHED) }
}
