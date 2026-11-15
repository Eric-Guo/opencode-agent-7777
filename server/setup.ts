import { Schema } from "effect"
import { nexusService } from "./native"
import type { BridgeConfig } from "./middleware"
import { BridgeError } from "./nexus"

const Action = Schema.Union([
  Schema.Struct({ action: Schema.Literals(["login", "device", "logout", "disconnect"]) }),
  Schema.Struct({
    action: Schema.Literal("pair"),
    model: Schema.String,
    workspace: Schema.String,
    directory: Schema.String,
  }),
])

export async function setup(config: BridgeConfig, value?: unknown) {
  if (!config.native) throw new BridgeError(503, "Configure the Nexus origin in the host.")
  const service = nexusService(await config.native.connection())

  if (value === undefined) return { status: await service.status(), account: await service.account() }
  const input = Schema.decodeUnknownSync(Action)(value)

  if (input.action === "login") return service.login()

  if (input.action === "device") return service.manage({ payload: { action: "login.device" } })

  if (input.action === "logout") {
    await service.logout()

    return null
  }

  if (input.action === "disconnect") return service.disconnect()

  if (input.action !== "pair") throw new BridgeError(400, "Unknown setup action.")

  return service.pair({
    origin: config.native.origin,
    model: input.model,
    workspace: input.workspace,
    directory: input.directory,
  })
}
