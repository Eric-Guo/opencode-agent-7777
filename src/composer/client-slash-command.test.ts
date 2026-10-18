import { expect, test } from "bun:test"
import { parseClientSlashCommand, parseSlashCommand } from "./client-slash-command"

test("parses commands with namespaces, empty arguments, and multiline arguments", () => {
  expect(parseSlashCommand("/review")).toEqual({ name: "review", input: "" })
  expect(parseSlashCommand("/plugin/review  changes\nwith context  ")).toEqual({
    name: "plugin/review",
    input: "changes\nwith context",
  })
  expect(parseSlashCommand("discuss /review")).toBeUndefined()
})

test("resolves local slash commands by exact trigger and retains unexpected arguments for validation", () => {
  const commands = [{ id: "session.export", trigger: "export", title: "Export session", onSelect() {} }]
  expect(parseClientSlashCommand(commands, "/export")).toEqual({ id: "session.export", input: "" })
  expect(parseClientSlashCommand(commands, "/export \n")).toEqual({ id: "session.export", input: "" })
  expect(parseClientSlashCommand(commands, "/export keep this")).toEqual({ id: "session.export", input: "keep this" })
  expect(parseClientSlashCommand(commands, "/exporting")).toBeUndefined()
  expect(parseClientSlashCommand(commands, "explain /export")).toBeUndefined()
  expect(parseClientSlashCommand(commands, "/review")).toBeUndefined()
})
