import { isConflictError, type SessionPromptInput } from "@opencode/client/promise"
import { SessionMessage } from "@opencode/schema/session-message"
import { checksum } from "@opencode/util/encode"
import type { ComposerRetry } from "./schema"

type AdmissionPayload = Omit<SessionPromptInput, "id" | "metadata"> & {
  metadata: { agent: string; model?: ComposerRetry["model"] }
}

// buildPromptRequest supplies deterministic wire fields, including ordered mentions and inline bytes.
function fingerprint(server: string, payload: AdmissionPayload) {
  const raw = JSON.stringify([server, payload])
  return `${raw.length}:${checksum(raw)}`
}

export function createPromptAdmission(
  server: string | undefined,
  payload: AdmissionPayload,
  saved?: ComposerRetry,
  catalogUnavailable = false,
) {
  // Before the model catalog hydrates, an unchanged draft can temporarily have no resolved model.
  // Use the saved selection only if it reconstructs the entire original request.
  const candidate =
    catalogUnavailable && !payload.metadata.model && saved?.model
      ? { ...payload, metadata: { ...payload.metadata, model: saved.model } }
      : payload
  const replay = !!server && !!saved && saved.fingerprint === fingerprint(server, candidate)
  const id = replay ? saved.id : SessionMessage.ID.create()
  const outgoing = replay ? candidate : payload
  return {
    input: { ...outgoing, id },
    replay,
    // First sends need the fingerprint only if admission fails and the draft is restored.
    retry: (error?: unknown): ComposerRetry | undefined =>
      server && !(isConflictError(error) && error.resource === id)
        ? {
            id,
            fingerprint: fingerprint(server, outgoing),
            ...(outgoing.metadata.model && { model: { ...outgoing.metadata.model } }),
          }
        : undefined,
  }
}
