import { OpenCode } from "@opencode/client/promise"

export type ServiceConnection = { url: string; password: string | null }

export function nexusService(connection: ServiceConnection) {
  if (!connection.password) throw new Error("The managed OpenCode service requires authentication.")
  return OpenCode.make({
    baseUrl: connection.url,
    headers: { authorization: "Basic " + Buffer.from("opencode:" + connection.password).toString("base64") },
  }).experimental.nexus
}
