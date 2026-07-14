import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/client"
import { extractPromptFromParts } from "./prompt"

describe("extractPromptFromParts", () => {
  test("restores the longest user text and uploaded attachments", () => {
    const parts = [
      {
        id: "text_1",
        sessionID: "session",
        messageID: "message",
        type: "text",
        text: "short",
      },
      {
        id: "text_2",
        sessionID: "session",
        messageID: "message",
        type: "text",
        text: "the original prompt",
      },
      {
        id: "file_1",
        sessionID: "session",
        messageID: "message",
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,AAA",
        filename: "image.png",
      },
    ] satisfies Part[]

    expect(extractPromptFromParts(parts)).toEqual({
      text: "the original prompt",
      attachments: [
        {
          id: "file_1",
          filename: "image.png",
          mime: "image/png",
          url: "data:image/png;base64,AAA",
        },
      ],
    })
  })
})
