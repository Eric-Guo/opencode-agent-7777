import type { OpenCodeClient } from "@opencode/client/promise"
import { bounded } from "./operation"

// createData's sync API has no per-observer cancellation. Bound its underlying API reads
// by the data owner's lifetime so its pending entry always settles and can be retried.
export function boundedReadClient(client: OpenCodeClient, owner: AbortSignal): OpenCodeClient {
  const wrap = <T extends object>(group: T, names: readonly (keyof T)[]): T => {
    if (!group) return group
    const result = { ...group }
    for (const name of names) {
      const method = group[name] as (input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>
      result[name] = ((input: unknown, options?: { signal?: AbortSignal }) =>
        bounded((signal) => method(input, { ...options, signal }), {
          signal: options?.signal ? AbortSignal.any([owner, options.signal]) : owner,
        })) as T[keyof T]
    }
    return result
  }
  return {
    ...client,
    session: {
      ...client.session,
      get: wrap(client.session, ["get"]).get,
      inbox: wrap(client.session.inbox, ["list"]),
      message: wrap(client.session.message, ["get"]),
    },
    message: wrap(client.message, ["list"]),
    model: wrap(client.model, ["list"]),
    provider: wrap(client.provider, ["list"]),
    agent: wrap(client.agent, ["list"]),
    integration: wrap(client.integration, ["list"]),
    command: wrap(client.command, ["list"]),
    skill: wrap(client.skill, ["list"]),
  }
}
