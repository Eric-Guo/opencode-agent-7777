import { isInvalidRequestError } from "@opencode/client/promise"
import { Schema } from "effect"
import { NexusCommand } from "@opencode/protocol/nexus-command"
import { BridgeError, canWrite, ownership, readChat, type Backend } from "./nexus"
import type { BridgeConfig } from "./middleware"
import modelConfig from "../src/providers/models/default-config.json"

/** The browser exposes application controls, never the service's credential export or key import. */
export async function manage(b: Backend, config: BridgeConfig, value: unknown) {
  const command = Schema.decodeUnknownSync(NexusCommand)(value)

  if (
    [
      "connection.import",
      "extension.asset",
      "application.accepted",
      "application.prepare",
      "application.submit",
      "application.approve",
    ].includes(command.action)
  )
    throw new BridgeError(403, "Use the scoped conversation controls.")

  if (
    "workspace" in command &&
    command.workspace &&
    command.workspace !== b.workspaceID &&
    !["workspace.use", "bot.resume", "bot.fork", "bot.workspace"].includes(command.action)
  )
    throw new BridgeError(403, "Select this workspace before changing it.")

  if (command.action === "platform.request") {
    if (command.principal !== b.humanID) throw new BridgeError(403, "The Nexus account changed.")

    if (!modelConfig.manageModels && decodeURIComponent(command.path).startsWith("/api/v1/admin/model_providers"))
      throw new BridgeError(403, "Model administration is disabled by this host.")
  }

  if (command.action.startsWith("persona.") && (await b.native.account())?.id !== b.humanID)
    throw new BridgeError(403, "Sign in with this Human's Nexus account to edit its persona.")

  if (
    command.action === "extension.call" &&
    ["editor.auth.credential", "editor.auth.start", "application.upload"].includes(command.name)
  )
    throw new BridgeError(403, "This service control is not exposed to browser modules.")

  if (
    command.action === "extension.call" &&
    ["memory-review.status", "memory-review.enable", "memory-review.disable", "memory-review.resume"].includes(
      command.name,
    )
  ) {
    const target = Schema.decodeUnknownSync(
      Schema.Struct({ workspace: Schema.optional(Schema.String), conversation: Schema.String }),
    )(command.input)

    if (target.workspace && target.workspace !== b.workspaceID)
      throw new BridgeError(403, "Select this workspace before changing it.")
    const { info } = await readChat(b, target.conversation)

    if (command.name !== "memory-review.status" && (ownership(info) || !canWrite(b, info)))
      throw new BridgeError(403, "Use the owning channel or a writable conversation.")
  }

  if (command.action === "application.operation") {
    const operation = Schema.decodeUnknownSync(
      Schema.Struct({
        action: Schema.String,
        workspace: Schema.optional(Schema.String),
        conversation: Schema.optional(Schema.String),
      }),
    )(command.operation)

    if (operation.workspace && operation.workspace !== b.workspaceID)
      throw new BridgeError(403, "Select this workspace before reading it.")

    const reads = [
      "models",
      "providers",
      "adaptations",
      "rules",
      "skills",
      "prompt.show",
      "conversation",
      "history",
      "turns",
      "participants",
      "cost",
      "inputs",
      "events",
    ]

    if (!reads.includes(operation.action)) throw new BridgeError(403, "Use the scoped conversation controls.")

    if (
      ["participants", "cost"].includes(operation.action) &&
      Object.keys(command.operation ?? {}).some((key) => !["action", "conversation"].includes(key))
    )
      throw new BridgeError(403, "This operation is read-only here.")

    if (operation.conversation) await readChat(b, operation.conversation)
  }

  if (command.action === "bot.submit") throw new BridgeError(403, "Use the scoped conversation controls.")

  if (command.action === "extension.list") return b.native.extensions()

  if (command.action === "bot.resume" || command.action === "bot.fork") {
    const info = await b.client.workspace(command.workspace).conversation(command.conversation).fetch()

    if (
      info.metadata["opencode.bot"] !== command.id ||
      !canWrite({ ...b, workspaceActive: true }, { ...info, archived_at: null })
    )
      throw new BridgeError(403, "Select a writable conversation belonging to this Bot.")
  }

  if (command.action === "schedule.list") {
    const schedules = command.conversation
      ? (await readChat(b, command.conversation)).chat.schedules
      : b.workspace.schedules

    const page = await schedules.list({ after: command.after, limit: command.conversation ? undefined : 100 })

    const access = new Map(
      await Promise.all(
        [...new Set(page.items.flatMap((row) => (row.conversation_public_id ? [row.conversation_public_id] : [])))].map(
          async (id) => {
            const { info } = await readChat(b, id)

            return [id, canWrite(b, info) && !ownership(info)] as const
          },
        ),
      ),
    )

    return {
      ...page,
      items: page.items.map((row) => ({ ...row, writable: access.get(row.conversation_public_id ?? "") ?? false })),
    }
  }

  if (command.action === "schedule.read") {
    const { chat } = await readChat(b, command.conversation)

    return chat.schedules.fetch(command.id)
  }

  if (command.action === "schedule.executions") {
    const { chat } = await readChat(b, command.conversation)

    return chat.schedules.executions(command.id, { after: command.after })
  }

  if (
    "conversation" in command &&
    typeof command.conversation === "string" &&
    command.action !== "bot.resume" &&
    command.action !== "bot.fork"
  ) {
    const { info } = await readChat(b, command.conversation)

    if (ownership(info) || !canWrite(b, info))
      throw new BridgeError(403, "Use the owning channel or a writable conversation.")
  }

  if (
    (command.action === "schedule.create" || command.action === "schedule.update") &&
    command.approval === "bypass" &&
    config.allowBypass === false
  )
    throw new BridgeError(403, "This host requires approval.")

  return b.native
    .manage({
      payload: command as Parameters<Backend["native"]["manage"]>[0]["payload"],
      "x-nexus-origin": config.native!.origin,
      "x-nexus-member-token": (b.memberToken ?? config.token)!,
    })
    .catch((error: unknown) => {
      if (
        isInvalidRequestError(error) &&
        (command.action === "settings.update" ||
          command.action.startsWith("preset.") ||
          (command.action === "extension.call" && command.name.startsWith("t3.")))
      )
        throw new BridgeError(400, error.message)
      throw error
    })
}
