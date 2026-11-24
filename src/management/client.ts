import { createSignal } from "solid-js"
import type { NexusSettings } from "@opencode/schema/nexus-settings"
import { createStore } from "solid-js/store"
import type { Schema } from "effect"
import type { NexusCommand } from "@opencode/protocol/nexus-command"
import type { ChatController } from "../nexus/controller"
import { request } from "../nexus/controller"

export type ManagementClient = ReturnType<typeof createManagementClient>

export function createManagementClient(chat: ChatController) {
  const [state, set] = createStore({ busy: false, error: "", notice: "" })
  // Reconnecting remounts the settings form while the authenticated scope is being resolved.
  const [defaultsDraft, setDefaultsDraft] = createSignal<{ scope: string; patch: NexusSettings.Patch }>()
  const scope = () => chat.s.connection?.scope
  const identity = () => JSON.parse(scope()?.startsWith("[") ? scope()! : "[]") as string[]
  const command = <T>(payload: typeof NexusCommand.Type) => request<T>("/manage", scope(), payload)
  const extension = <T>(name: string, input: Schema.Json = {}) => command<T>({ action: "extension.call", name, input })

  const platform = <T>(
    path: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
    body?: Schema.Json,
    key?: string,
  ) => command<T>({ action: "platform.request", principal: identity()[1], path, method, body, key })

  const pending = new Set<symbol>()
  const reportError = (error: unknown) => set("error", error instanceof Error ? error.message : String(error))

  async function perform(action: () => Promise<unknown>) {
    const operation = Symbol()
    pending.add(operation)
    set({ busy: true, error: "", notice: "" })

    try {
      await action()

      return true
    } catch (error) {
      reportError(error)

      return false
    } finally {
      pending.delete(operation)
      set("busy", pending.size > 0)
    }
  }

  return {
    state,
    scope,
    command,
    extension,
    platform,
    perform,
    reportError,
    defaultsDraft,
    setDefaultsDraft,
    workspace: () => identity()[2],
    human: () => identity()[1],
    notice: (text: string) => set("notice", text),
    chat,
  }
}
