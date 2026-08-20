import { describe, expect, test } from "bun:test"
import type { SessionMessageUser } from "@opencode-ai/client/promise"
import { extractPromptFromMessage } from "./prompt"

describe("extractPromptFromMessage", () => {
  test("restores presentation text and uploaded attachments", () => {
    const message = {
      id: "msg_1",
      type: "user",
      text: "the model prompt",
      metadata: { displayText: "the visible prompt", comments: [] },
      files: [
        {
          data: "AAA",
          mime: "image/png",
          source: { type: "inline" },
          name: "image.png",
        },
      ],
      time: { created: 1 },
    } satisfies SessionMessageUser

    expect(extractPromptFromMessage(message)).toEqual({
      prompt: "the visible prompt",
      attachments: [
        {
          id: "msg_1:file:0",
          filename: "image.png",
          mime: "image/png",
          url: "data:image/png;base64,AAA",
        },
      ],
    })
  })

  test("does not restore file mentions as uploaded attachments", () => {
    const message = {
      id: "msg_1",
      type: "user",
      text: "inspect @src/app.ts",
      files: [
        {
          data: "",
          mime: "text/plain",
          source: { type: "uri", uri: "file:///repo/src/app.ts" },
          name: "app.ts",
          mention: { text: "@src/app.ts", start: 8, end: 19 },
        },
      ],
      time: { created: 1 },
    } satisfies SessionMessageUser

    expect(extractPromptFromMessage(message)).toEqual({ prompt: "inspect @src/app.ts", attachments: [] })
  })
})
