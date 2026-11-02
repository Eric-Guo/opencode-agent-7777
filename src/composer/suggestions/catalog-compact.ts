import type { AgentInfo, CommandInfo, SkillInfo } from "@opencode/client/promise"
import { Skill } from "@opencode/schema/skill"
import { fileUrl } from "@/workspaces/files/path"
import type { ComposerSuggestion } from "../types"

// Catalog projection is independent of editor state and location-resource loading.
// Local actions and server commands use the same suggestion shape, with local triggers taking precedence.
export function commandSuggestion(command: {
  id: string
  trigger: string
  title: string
  description?: string
}): ComposerSuggestion {
  return {
    id: command.id,
    kind: "command",
    label: `/${command.trigger}`,
    trigger: command.trigger,
    title: command.title,
    description: command.description,
  }
}

export function commandSuggestions(commands: readonly CommandInfo[], local: readonly ComposerSuggestion[]) {
  const triggers = new Set(local.map((item) => item.trigger))
  return [
    ...local,
    ...commands
      .filter((command) => !triggers.has(command.name))
      .map((command) =>
        commandSuggestion({
          id: `custom.${command.name}`,
          trigger: command.name,
          title: command.name,
          description: command.description,
        }),
      ),
  ]
}

export function contextSuggestions(skills: readonly SkillInfo[], agents: readonly AgentInfo[]): ComposerSuggestion[] {
  return [
    ...skills.map((skill) => ({
      id: `skill:${skill.id}`,
      kind: "skill" as const,
      label: `@${skill.id}`,
      description: skill.description,
      mention: {
        type: "skill" as const,
        id: Skill.ID.make(skill.id),
        name: Skill.Name.make(skill.name),
        content: `@${skill.id}`,
        start: 0,
        end: 0,
      },
    })),
    ...agents
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map((agent) => ({
        id: `agent:${agent.name}`,
        kind: "agent" as const,
        label: `@${agent.name}`,
        description: agent.description,
        mention: { type: "agent" as const, name: agent.name, content: `@${agent.name}`, start: 0, end: 0 },
      })),
  ]
}

export function fileSuggestions(paths: readonly string[], directory: string): ComposerSuggestion[] {
  return paths.map((path) => ({
    id: `file:${path}`,
    kind: "file",
    label: path,
    path,
    // Pin the original directory so the single draft and cross-session history keep the selected file.
    mention: { type: "file", path, url: fileUrl(directory, path), content: `@${path}`, start: 0, end: 0 },
  }))
}
