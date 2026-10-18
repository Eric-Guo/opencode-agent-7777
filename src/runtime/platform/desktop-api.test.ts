import { describe, expect, expectTypeOf, test } from "bun:test"
import { Schema } from "effect"
import { FilePickerOptions, PickedFiles, ServerReadyData, type DesktopAPI } from "./desktop-api"

const decode = Schema.decodeUnknownSync(ServerReadyData)

test("schema-derived host types preserve mutable nested values and optional capabilities", async () => {
  const api: DesktopAPI = {
    awaitInitialization: async () =>
      decode({
        url: "http://localhost:4096",
        suggestedQuestions: ["Help"],
        storageKeys: { sessionID: "id", sessionDirectory: "directory", promptDraft: "draft" },
      }),
  }
  const ready = await api.awaitInitialization()
  ready.suggestedQuestions?.push("More")
  ready.storageKeys!.promptDraft = "updated-draft"
  expect(ready).toEqual({
    url: "http://localhost:4096",
    suggestedQuestions: ["Help", "More"],
    storageKeys: { sessionID: "id", sessionDirectory: "directory", promptDraft: "updated-draft" },
  })

  const options = Schema.decodeUnknownSync(FilePickerOptions)({ extensions: ["txt"] })
  options.extensions?.push("md")
  options.multiple = true
  expect(options).toEqual({ extensions: ["txt", "md"], multiple: true })

  const picked = Schema.decodeUnknownSync(PickedFiles)({
    token: "picked-files",
    files: [{ path: "/project/notes.txt", name: "notes.txt", size: 3 }],
  })
  picked.files[0].name = "renamed.txt"
  picked.files.push({ path: "/project/other.txt", name: "other.txt", size: 4 })
  expect(picked.files).toEqual([
    { path: "/project/notes.txt", name: "renamed.txt", size: 3 },
    { path: "/project/other.txt", name: "other.txt", size: 4 },
  ])
  expectTypeOf<NonNullable<Window["api"]>>().toEqualTypeOf<DesktopAPI>()
})

describe("desktop initialization response", () => {
  test.each([
    null,
    {},
    { sessionID: "id", sessionDirectory: "directory", promptDraft: "" },
    { sessionID: 5, sessionDirectory: "directory", promptDraft: "draft" },
  ])("rejects malformed storage keys: %j", (storageKeys) => {
    expect(() => decode({ url: "http://localhost:4096", storageKeys })).toThrow()
  })
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
