import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ServerReadyData } from "./desktop-rpc-client"

const decode = Schema.decodeUnknownSync(ServerReadyData)

describe("desktop initialization response", () => {
  test("accepts current desktop data without a password and preserves tab configuration", () => {
    expect(
      decode({
        url: "http://localhost:4096",
        localAgent: "support",
        welcomeText: "Welcome",
        suggestedQuestions: ["Help"],
        ssoJwtSecretKey: "test-key",
      }),
    ).toEqual({
      url: "http://localhost:4096",
      localAgent: "support",
      welcomeText: "Welcome",
      suggestedQuestions: ["Help"],
      ssoJwtSecretKey: "test-key",
    })
  })

  test.each([null, "", "legacy-password"])("preserves legacy password %p", (password) => {
    expect(decode({ url: "http://localhost:4096", password })).toEqual({
      url: "http://localhost:4096",
      password,
    })
  })

  test("still rejects missing URLs and malformed credentials", () => {
    expect(() => decode({})).toThrow()
    expect(() => decode({ url: "http://localhost:4096", password: 123 })).toThrow()
  })
})
