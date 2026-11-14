export type RequestKey = { readonly id: string; readonly sessionID: string }
const key = (request: RequestKey) => JSON.stringify([request.sessionID, request.id])
export type ReplyState = {
  readonly attempt: number
  readonly reply:
    | { readonly status: "idle" }
    | { readonly status: "responding"; readonly attempt: number; readonly request: RequestKey }
  readonly settled: Readonly<Record<string, true | undefined>>
}
export type ReplyEvent =
  | { readonly type: "send"; readonly request: RequestKey }
  | { readonly type: "resolved"; readonly request: RequestKey }
  | { readonly type: "succeeded" | "failed"; readonly attempt: number }
export const createReplyState = (): ReplyState => ({ attempt: 0, reply: { status: "idle" }, settled: {} })
export function transitionReply(state: ReplyState, event: ReplyEvent): ReplyState {
  if (event.type === "send") {
    if (state.reply.status !== "idle" || state.settled[key(event.request)]) return state
    return {
      ...state,
      attempt: state.attempt + 1,
      reply: { status: "responding", attempt: state.attempt + 1, request: event.request },
    }
  }
  if (event.type === "resolved")
    return {
      ...state,
      settled: { ...state.settled, [key(event.request)]: true },
      reply:
        state.reply.status === "responding" && key(state.reply.request) === key(event.request)
          ? { status: "idle" }
          : state.reply,
    }
  if (state.reply.status !== "responding" || state.reply.attempt !== event.attempt) return state
  if (event.type === "succeeded") return transitionReply(state, { type: "resolved", request: state.reply.request })
  return { ...state, reply: { status: "idle" } }
}
export const requestSettled = (state: ReplyState, request: RequestKey) => !!state.settled[key(request)]
export const respondingRequest = (state: ReplyState) =>
  state.reply.status === "responding" ? state.reply.request.id : undefined
