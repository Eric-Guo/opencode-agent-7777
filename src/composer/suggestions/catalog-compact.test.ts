import { expect, test } from "bun:test"
import type { AgentInfo, SkillInfo } from "@opencode/client/promise"
import { Skill } from "@opencode/schema/skill"
import { createClientSlashCommands } from "../client-slash-command"
import { createComposerEditorActions } from "../editor/actions"
import { buildPromptRequest } from "../request"
import { createPromptState } from "../state"
import { commandSuggestions, contextSuggestions, fileSuggestions } from "./catalog-compact"

test("local command triggers win without reordering or losing server command metadata", () => {
  const local = createClientSlashCommands({
    commands: () => [{ id: "session.export", trigger: "export", title: "Export session", onSelect() {} }],
    draft: createPromptState(),
    beforeSelect() {},
    onArguments() {},
  })
  const commands = [
    { name: "z/review", description: "Review changes" },
    { name: "export", description: "Server export" },
    { name: "a/format" },
    { name: "exporting" },
  ]
  expect(commandSuggestions(commands, local.suggestions())).toEqual([
    { id: "session.export", kind: "command", label: "/export", trigger: "export", title: "Export session" },
    {
      id: "custom.z/review",
      kind: "command",
      label: "/z/review",
      trigger: "z/review",
      title: "z/review",
      description: "Review changes",
    },
    { id: "custom.a/format", kind: "command", label: "/a/format", trigger: "a/format", title: "a/format" },
    { id: "custom.exporting", kind: "command", label: "/exporting", trigger: "exporting", title: "exporting" },
  ])
  expect(commands.map((command) => command.name)).toEqual(["z/review", "export", "a/format", "exporting"])
})

test("context suggestions retain skill IDs and agent names while excluding hidden and primary-only agents", () => {
  const agent = (id: string, name: string, mode: AgentInfo["mode"], hidden = false): AgentInfo => ({
    id,
    name,
    mode,
    hidden,
    request: { settings: {}, headers: {}, body: {} },
    permissions: [],
  })
  const skills: SkillInfo[] = [
    { id: "plugin/review", name: "Review code", description: "Review a patch", path: "/skills/review", content: "" },
  ]
  const agents = [
    agent("hidden", "private", "subagent", true),
    agent("build", "builder", "primary"),
    agent("explore-id", "explore", "subagent"),
    agent("general-id", "general", "all"),
  ]
  const suggestions = contextSuggestions(skills, agents)
  expect(suggestions).toEqual([
    {
      id: "skill:plugin/review",
      kind: "skill",
      label: "@plugin/review",
      description: "Review a patch",
      mention: {
        type: "skill",
        id: Skill.ID.make("plugin/review"),
        name: Skill.Name.make("Review code"),
        content: "@plugin/review",
        start: 0,
        end: 0,
      },
    },
    {
      id: "agent:explore",
      kind: "agent",
      label: "@explore",
      mention: { type: "agent", name: "explore", content: "@explore", start: 0, end: 0 },
    },
    {
      id: "agent:general",
      kind: "agent",
      label: "@general",
      mention: { type: "agent", name: "general", content: "@general", start: 0, end: 0 },
    },
  ])

  const draft = createPromptState()
  const actions = createComposerEditorActions(draft.store)
  for (const suggestion of suggestions) {
    actions.addText("@")
    actions.addMention(suggestion.mention!)
  }
  expect(buildPromptRequest(draft.capture())).toEqual({
    text: "@plugin/review @explore @general",
    files: [],
    skills: [{ id: Skill.ID.make("plugin/review"), mention: { text: "@plugin/review", start: 0, end: 14 } }],
    agents: [
      { name: "explore", mention: { text: "@explore", start: 15, end: 23 } },
      { name: "general", mention: { text: "@general", start: 24, end: 32 } },
    ],
  })
  expect(skills[0].name).toBe("Review code")
  expect(agents.map((item) => item.name)).toEqual(["private", "builder", "explore", "general"])
  expect(suggestions.map((item) => item.mention?.start)).toEqual([0, 0, 0])
})

test("file suggestions preserve the search directory through draft restoration and submission", () => {
  const [suggestion] = fileSuggestions(["docs/review notes.md"], "/original project")
  expect(suggestion).toMatchObject({ id: "file:docs/review notes.md", label: "docs/review notes.md", kind: "file" })
  const draft = createPromptState()
  createComposerEditorActions(draft.store).addMention(suggestion.mention!)
  const restored = createPromptState(draft.capture())
  expect(buildPromptRequest(restored.capture())).toEqual({
    text: "@docs/review notes.md",
    files: [
      {
        uri: "file:///original%20project/docs/review%20notes.md",
        name: "review notes.md",
        mention: { text: "@docs/review notes.md", start: 0, end: 21 },
      },
    ],
  })
})
