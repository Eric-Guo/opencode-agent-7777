import { describe, expect, test } from "bun:test"
import type { OpenCodeEvent as OpencodeEvent, PermissionRequest } from "@opencode-ai/client"
import { permissionAsked, permissionReplied, toV2PermissionView } from "@/pages/session/composer/session-request-tree"

const request: PermissionRequest = {
  id: "per_test",
  sessionID: "ses_test",
  action: "glob",
  resources: ["/tmp/**"],
}

describe("permission event handling", () => {
  test("reads permission.asked data", () => {
    const event = {
      id: "evt_asked",
      created: 1,
      type: "permission.asked",
      data: request,
    } satisfies Extract<OpencodeEvent, { type: "permission.asked" }>

    expect(permissionAsked(event)).toEqual(request)
    expect(toV2PermissionView(request)).toEqual({
      id: "per_test",
      sessionID: "ses_test",
      permission: "glob",
      patterns: ["/tmp/**"],
      replyTarget: "session",
    })
  })

  test("reads permission.replied data", () => {
    const event = {
      id: "evt_replied",
      created: 2,
      type: "permission.replied",
      data: {
        sessionID: "ses_test",
        requestID: "per_test",
        reply: "once",
      },
    } satisfies Extract<OpencodeEvent, { type: "permission.replied" }>

    expect(permissionReplied(event)).toEqual(event.data)
  })
})
