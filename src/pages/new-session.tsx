import { createMemo, createSignal } from "solid-js"
import type { Part, Session } from "@opencode-ai/sdk"
import type { HistoryItem } from "@/context/global-sync/session-cache"
import { createSession } from "@/context/global-sync/session-load"
import { translateSync } from "@/context/language"
import type { ModelSelection } from "@/context/local"
import { setState, state } from "@/context/server-session"
import { activateSession, restartSessionEventStream } from "@/context/server-sync"
import { createServerSdk, type OpencodeClient } from "@/context/server-sdk"
import { normalizeSessionDirectory } from "@/context/session-directory"
import { readableError } from "@/utils/server-errors"

let newSessionPromise: Promise<void> | undefined
const defaultTitlePattern = /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function isDefaultTitle(title: string) {
  return title.match(defaultTitlePattern)?.[1] !== undefined
}

function isMeaningfulUserPart(part: Part) {
  if (part.type === "compaction" || part.type === "step-start" || part.type === "step-finish") return false
  if (part.type === "text") return !part.synthetic && part.text.trim().length > 0
  if (part.type === "subtask") return part.prompt.trim().length > 0
  return true
}

function sessionHasUserContent(messages: HistoryItem[]) {
  return messages.some(
    (message) => message.info.role === "user" && message.parts.some((part) => isMeaningfulUserPart(part)),
  )
}

function modelForSummary(messages: HistoryItem[], selectedModel: ModelSelection | undefined) {
  if (selectedModel) return selectedModel
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.info.role !== "user") continue
    const model = message.info.model
    if (model.providerID && model.modelID) return model
  }
  return undefined
}

function parseModelID(value: string | undefined): ModelSelection | undefined {
  if (!value) return
  const separator = value.indexOf("/")
  if (separator <= 0 || separator === value.length - 1) return
  return {
    providerID: value.slice(0, separator),
    modelID: value.slice(separator + 1),
  }
}

function uniqueModels(models: (ModelSelection | undefined)[]) {
  const seen = new Set<string>()
  return models.filter((model): model is ModelSelection => {
    if (!model) return false
    const key = `${model.providerID}/${model.modelID}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function configuredSmallModel(client: OpencodeClient, directory: string) {
  try {
    const result = await client.config.get({
      query: { directory: normalizeSessionDirectory(directory) },
    })
    return parseModelID(result.data?.small_model)
  } catch {
    return undefined
  }
}

async function previousSessionMessages(client: OpencodeClient, session: Session, directory: string) {
  try {
    const result = await client.session.messages({
      path: { id: session.id },
      query: { directory: normalizeSessionDirectory(directory) },
    })
    return result.data ?? []
  } catch {
    return state.session?.id === session.id ? state.messages : []
  }
}

async function summarizePreviousSession(input: {
  client: OpencodeClient
  sessionID: string
  directory: string
  models: ModelSelection[]
}) {
  let lastError: unknown
  for (const model of input.models) {
    try {
      await input.client.session.summarize({
        path: { id: input.sessionID },
        query: { directory: input.directory },
        body: {
          providerID: model.providerID,
          modelID: model.modelID,
        },
      })
      return
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
}

export function startNewSession() {
  if (newSessionPromise) return newSessionPromise

  const server = state.server
  const directory = state.session?.directory
  if (!server || !directory) {
    setState("error", translateSync("error.sessionNotReady"))
    return Promise.resolve()
  }

  setState("error", "")
  const baseClient = createServerSdk(server).client
  const previousSession = state.session
  const selectedModel = state.selectedModel

  newSessionPromise = Promise.all([
    previousSession ? previousSessionMessages(baseClient, previousSession, directory) : Promise.resolve([]),
    configuredSmallModel(baseClient, directory),
  ])
    .then(([messages, smallModel]) => {
      const previousSessionHasContent = sessionHasUserContent(messages)
      return createSession(baseClient, directory).then((session) => ({
        session,
        previousSessionHasContent,
        summaryModels: uniqueModels([smallModel, modelForSummary(messages, selectedModel)]),
      }))
    })
    .then((input) => activateSession(server, input.session).then(() => input))
    .then((input) => {
      restartSessionEventStream()
      if (
        previousSession &&
        input.summaryModels.length > 0 &&
        input.previousSessionHasContent &&
        !previousSession.summary &&
        isDefaultTitle(previousSession.title)
      ) {
        void summarizePreviousSession({
          client: baseClient,
          sessionID: previousSession.id,
          directory,
          models: input.summaryModels,
        })
          .catch((error) => {
            console.warn("[7777] failed to summarize previous session after creating a new session", error)
          })
      }
    })
    .catch((error) => {
      setState("error", readableError(error))
    })
    .finally(() => {
      newSessionPromise = undefined
    })

  return newSessionPromise
}

export function createNewSessionController() {
  const [pending, setPending] = createSignal(false)
  const disabled = createMemo(() => state.status !== "ready")

  const create = () => {
    if (pending() || disabled()) return
    setPending(true)
    void startNewSession().finally(() => setPending(false))
  }

  return {
    pending,
    disabled,
    create,
  }
}
