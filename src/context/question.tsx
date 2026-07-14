import type {
  OpenCodeEvent as OpencodeEvent,
  QuestionV2Answer as QuestionAnswer,
  QuestionV2Request as QuestionRequest,
} from "@opencode-ai/client"
import { translateSync } from "@/context/language"
import { scheduleRefresh } from "@/context/server-sync"
import { currentSession, setState, state } from "@/context/server-session"
import { readableError } from "@/utils/server-errors"

type QuestionAskedEvent = {
  type: "question.v2.asked"
  data?: QuestionRequest
  properties?: QuestionRequest
}

type QuestionFinishedEvent = {
  type: "question.v2.replied" | "question.v2.rejected"
  data?: QuestionFinishedPayload
  properties?: QuestionFinishedPayload
}

type QuestionFinishedPayload = {
  sessionID?: string
  requestID?: string
}

function questionAsked(event: OpencodeEvent) {
  const candidate = event as unknown as QuestionAskedEvent
  if (candidate.type !== "question.v2.asked") return
  return candidate.data ?? candidate.properties
}

function questionFinished(event: OpencodeEvent) {
  const candidate = event as unknown as QuestionFinishedEvent
  if (candidate.type !== "question.v2.replied" && candidate.type !== "question.v2.rejected") return
  return candidate.data ?? candidate.properties
}

export function refreshQuestions() {
  const active = currentSession()
  if (!active) return Promise.resolve()

  return active.client.question.list({ sessionID: active.sessionID }).then((result) => {
    setState(
      "questionRequest",
      result.find((request) => request.sessionID === active.sessionID),
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
  const active = currentSession()
  if (!request || !active || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", true)
  void active.client.question
    .reply({ sessionID: request.sessionID, requestID: request.id, answers })
    .then(() => {
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
  const active = currentSession()
  if (!request || !active || state.questionResponding) return

  setState("error", "")
  setState("questionResponding", true)
  void active.client.question
    .reject({ sessionID: request.sessionID, requestID: request.id })
    .then(() => {
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
