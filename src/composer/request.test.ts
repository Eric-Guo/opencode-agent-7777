import { describe, expect, test } from "bun:test"
import { buildPromptRequest } from "./request"

describe("buildPromptRequest", () => {
  test("trims text and preserves attachment order", () => {
    expect(
      buildPromptRequest({
        prompt: "  inspect these files  ",
        attachments: [
          { id: "one", filename: "one.txt", mime: "text/plain", url: "data:text/plain;base64,b25l" },
          { id: "two", filename: "two.txt", mime: "text/plain", url: "data:text/plain;base64,dHdv" },
        ],
      }),
    ).toEqual({
      text: "inspect these files",
      files: [
        { uri: "data:text/plain;base64,b25l", name: "one.txt" },
        { uri: "data:text/plain;base64,dHdv", name: "two.txt" },
      ],
    })
  })

  test("uses the source path when the attachment came from the desktop", () => {
    const request = buildPromptRequest({
      prompt: "inspect this",
      attachments: [
        {
          id: "external",
          filename: "settings.json",
          sourcePath: "C:\\Users\\Luke\\settings.json",
          mime: "application/json",
          url: "data:application/json;base64,e30=",
        },
      ],
    })

    expect(request.files[0]?.name).toBe("C:\\Users\\Luke\\settings.json")
  })
})
