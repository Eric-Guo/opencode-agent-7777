import type { CreateInput } from "@cybros/agent"
import type { ConversationModes, ModeValues } from "../src/nexus/chat"
import { BridgeError, type Backend } from "./nexus"

const route = "/conversations/prepare-input-policy"
const unavailable = "This rho daemon cannot prepare input policies. Update rho before sending."
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

// An empty preparation is side-effect free and identifies the POST contract even before the first chat exists.
async function supportsPolicy(b: Backend) {
  const res = await b.rhoGet(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  if (res.status === 404) return false
  if (res.status === 400 && (await res.json()).error?.code === "parameter_missing") return true
  throw new BridgeError(503, "Could not verify rho’s input policy support.")
}
function decodeModes(value: unknown): ConversationModes {
  if (
    !record(value) ||
    typeof value.code_mode !== "boolean" ||
    typeof value.subagent !== "boolean" ||
    typeof value.available !== "boolean" ||
    typeof value.code_mode_available !== "boolean"
  )
    throw new BridgeError(502, "rho returned invalid conversation modes.")
  return {
    code_mode: value.code_mode,
    subagent: value.subagent,
    available: value.available,
    code_mode_available: value.code_mode_available,
  }
}
export async function defaultModes(b: Backend) {
  if (!(await supportsPolicy(b))) return null
  const res = await b.rhoGet("/settings/status")
  if (!res.ok) throw new BridgeError(res.status, "Could not read rho’s default conversation modes.")
  return decodeModes((await res.json()).defaults?.conversation_modes)
}
function address(b: Backend, id: string) {
  return { workspace_public_id: b.workspaceID, public_id: id }
}
export async function readModes(b: Backend, id: string) {
  const res = await b.rhoGet("/conversations/modes?" + new URLSearchParams(address(b, id)))
  if (!res.ok) throw new BridgeError(res.status, "Could not read conversation modes.")
  return decodeModes((await res.json()).modes)
}
export async function updateModes(b: Backend, id: string, patch: Partial<ModeValues>) {
  const keys = Object.keys(patch)
  if (
    !keys.length ||
    keys.some((k) => !["code_mode", "subagent"].includes(k) || typeof patch[k as keyof ModeValues] !== "boolean")
  )
    throw new BridgeError(400, "Expected a boolean Code mode or Subagent choice.")
  if (!(await supportsPolicy(b))) throw new BridgeError(503, unavailable)
  const modes = await readModes(b, id)
  if (!modes.available || (patch.code_mode === true && !modes.code_mode_available))
    throw new BridgeError(409, "This conversation mode is unavailable.")
  const res = await b.rhoGet("/conversations/modes", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-rho-viewing-conversation": id,
      "x-rho-viewing-workspace": b.workspaceID,
    },
    body: JSON.stringify({ ...address(b, id), ...patch }),
  })
  if (!res.ok) throw new BridgeError(res.status, "rho refused the conversation mode change.")
  return decodeModes((await res.json()).modes)
}
export async function inputPolicy(b: Backend, id: string) {
  const res = await b.rhoGet(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(address(b, id)),
  })
  if (!res.ok) {
    // A missing conversation and a missing route can both be reported as 404.
    if (res.status === 404 && !(await supportsPolicy(b))) throw new BridgeError(503, unavailable)
    throw new BridgeError(res.status, "rho refused to prepare this reply’s tool policy.")
  }
  const data = await res.json()
  if (
    !record(data) ||
    !Array.isArray(data.tool_names) ||
    !data.tool_names.every((n) => typeof n === "string" && n.trim()) ||
    ("executor_contexts" in data &&
      (!record(data.executor_contexts) || !Object.values(data.executor_contexts).every(record)))
  )
    throw new BridgeError(502, "rho returned an invalid tool policy. No reply was prepared.")
  return {
    tool_names: data.tool_names as string[],
    ...("executor_contexts" in data
      ? { executor_contexts: data.executor_contexts as NonNullable<CreateInput["executor_contexts"]> }
      : {}),
  }
}
