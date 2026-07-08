import type { Event as OpencodeEvent } from "@opencode-ai/sdk"
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2"
import { translateSync } from "@/context/language"
import { scheduleRefresh } from "@/context/server-sync"
import { currentSession, setState, state } from "@/context/server-session"
import { normalizeSessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"
import { serverHttpHeaders, serverUrl } from "@/utils/server"

type QuestionAskedEvent = {
  type: "question.asked"
  data?: QuestionRequest
  properties?: QuestionRequest
}

type QuestionFinishedEvent = {
  type: "question.replied" | "question.rejected"
  data?: QuestionFinishedPayload
  properties?: QuestionFinishedPayload
}

type QuestionFinishedPayload = {
  sessionID?: string
  requestID?: string
}

type QuestionListResponse = QuestionRequest[] | { data?: QuestionRequest[] }

function questionAsked(event: OpencodeEvent) {
  const candidate = event as unknown as QuestionAskedEvent
  if (candidate.type !== "question.asked") return
  return candidate.data ?? candidate.properties
}

function questionFinished(event: OpencodeEvent) {
  const candidate = event as unknown as QuestionFinishedEvent
  if (candidate.type !== "question.replied" && candidate.type !== "question.rejected") return
  return candidate.data ?? candidate.properties
}

function questionUrl(pathname: string) {
  const server = state.server
  const session = state.session
  if (!server || !session) return

  const url = new URL(serverUrl(server, pathname))
  url.searchParams.set("directory", normalizeSessionDirectory(session.directory))
  return url.toString()
}

function listedQuestions(result: QuestionListResponse) {
  return Array.isArray(result) ? result : (result.data ?? [])
}

export function refreshQuestions() {
  const active = currentSession()
  const url = questionUrl("/question")
  if (!active || !url || !state.server) return Promise.resolve()

  return fetch(url, {
    headers: serverHttpHeaders(state.server),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`${translateSync("error.requestFailed")}: ${response.status}`)
      return response.json() as Promise<QuestionListResponse>
    })
    .then((result) => {
      setState(
        "questionRequest",
        listedQuestions(result).find((request) => request.sessionID === active.sessionID),
      )
      setState("questionResponding", false)
    })
}

export function handleQuestionEvent(event: OpencodeEvent) {
  const asked = questionAsked(event)
  if (asked && asked.sessionID === state.session?.id) {
    setState("questionRequest", asked)
    setState("questionResponding", false)
    return true
  }

  const finished = questionFinished(event)
  if (finished && finished.sessionID === state.session?.id && finished.requestID) {
    setState("questionRequest", (current) => (current?.id === finished.requestID ? undefined : current))
    setState("questionResponding", false)
    return true
  }

  return false
}

export function replyQuestion(answers: QuestionAnswer[]) {
  const request = state.questionRequest
  const url = request ? questionUrl(`/question/${encodeURIComponent(request.id)}/reply`) : undefined
  if (!request || !url || !state.server || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", true)
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...serverHttpHeaders(state.server),
    },
    body: JSON.stringify({ answers }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`${translateSync("error.requestFailed")}: ${response.status}`)
      setState("questionRequest", (current) => (current?.id === request.id ? undefined : current))
      scheduleRefresh(120)
    })
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      setState("questionResponding", false)
    })
}

export function rejectQuestion() {
  const request = state.questionRequest
  const url = request ? questionUrl(`/question/${encodeURIComponent(request.id)}/reject`) : undefined
  if (!request || !url || !state.server || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", true)
  void fetch(url, {
    method: "POST",
    headers: serverHttpHeaders(state.server),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`${translateSync("error.requestFailed")}: ${response.status}`)
      setState("questionRequest", (current) => (current?.id === request.id ? undefined : current))
      scheduleRefresh(120)
    })
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      setState("questionResponding", false)
    })
}
