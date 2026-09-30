import { expect, test } from "bun:test"
import { parseSlashCommand } from "./client-slash-command"

test("parses commands with namespaces, empty arguments, and multiline arguments", () => {
  expect(parseSlashCommand("/review")).toEqual({ name: "review", input: "" })
  expect(parseSlashCommand("/plugin/review  changes\nwith context  ")).toEqual({
    name: "plugin/review",
    input: "changes\nwith context",
  })
  expect(parseSlashCommand("discuss /review")).toBeUndefined()
})
