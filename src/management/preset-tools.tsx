import { For, Show, createMemo } from "solid-js"
import { Checkbox } from "@opencode/ui/checkbox"
import type { NexusPreset } from "@opencode/schema/nexus-preset"

type Connection = NexusPreset.ToolChoices["mcp_connections"][number]
type Ref = Connection["ref"]

function identity(ref: Ref) {
  return ref.source === "nexus"
    ? JSON.stringify([ref.source, ref.connection_public_id])
    : JSON.stringify([ref.source, ref.executor_public_id, ref.server_key])
}

export function PresetTools(props: {
  configuration: NexusPreset.Configuration
  choices: NexusPreset.ToolChoices | null
  update(patch: Partial<NexusPreset.Configuration>): void
}) {
  const selection = () => props.configuration.mcp ?? { disabled_connections: [], disabled_tools: [] }
  const connections = createMemo(() => {
    const rows = new Map<string, Connection>()
    const aliases = new Set<string>()
    for (const row of props.choices?.mcp_connections ?? []) {
      rows.set(identity(row.ref), row)
      if (row.previous_ref) aliases.add(identity(row.previous_ref))
    }
    for (const ref of [...selection().disabled_connections, ...selection().disabled_tools]) {
      const key = identity(ref)
      if (rows.has(key) || aliases.has(key)) continue
      // Tool exclusions carry an additional name. Only the connection identity belongs in a connection exclusion.
      const reference: Ref =
        ref.source === "nexus"
          ? { source: ref.source, connection_public_id: ref.connection_public_id }
          : { source: ref.source, executor_public_id: ref.executor_public_id, server_key: ref.server_key }
      rows.set(key, {
        ref: reference,
        name: ref.source === "nexus" ? ref.connection_public_id : ref.server_key,
        available: false,
        account_label: null,
        tools: [],
      })
    }
    return rows
  })
  return (
    <>
      <For each={["tools", "runner_tool_names"] as const}>
        {(key) => {
          const choices = () =>
            (props.choices?.tools ?? []).filter((row) => (row.kind === "runner") === (key === "runner_tool_names"))
          const selected = () => props.configuration[key] ?? []
          const names = () => [
            ...new Set([
              ...choices().map((row) => row.name),
              ...selected().filter((name) => !choices().some((row) => row.canonical === name)),
            ]),
          ]
          return (
            <fieldset>
              <legend>{key === "tools" ? "Kernel and application tools" : "Runner tools"}</legend>
              <Checkbox
                checked={props.configuration[key] != null}
                onChange={(checked) => props.update({ [key]: checked ? [] : null })}
              >
                Restrict selected tools
              </Checkbox>
              <Show when={props.configuration[key] != null}>
                <For each={names()}>
                  {(name) => {
                    const row = () => choices().find((tool) => tool.name === name)
                    const matches = (value: string) => value === name || row()?.canonical === value
                    return (
                      <Checkbox
                        checked={selected().some(matches)}
                        description={[row()?.kind ?? "Currently unavailable", row()?.description]
                          .filter(Boolean)
                          .join(" · ")}
                        onChange={(checked) =>
                          props.update({
                            [key]: checked ? [...selected(), name] : selected().filter((value) => !matches(value)),
                          })
                        }
                      >
                        {name}
                      </Checkbox>
                    )
                  }}
                </For>
              </Show>
            </fieldset>
          )
        }}
      </For>
      <fieldset>
        <legend>MCP connections and tools</legend>
        <For each={[...connections().keys()]} fallback={<small>No MCP connections available.</small>}>
          {(key) => {
            const row = () => connections().get(key)!
            const matches = (ref: Ref) =>
              identity(ref) === key || (!!row().previous_ref && identity(ref) === identity(row().previous_ref!))
            const off = () => selection().disabled_connections.some(matches)
            const excluded = () =>
              selection()
                .disabled_tools.filter(matches)
                .map((tool) => tool.tool_name)
            const names = () => [...new Set([...row().tools.map((tool) => tool.name), ...excluded()])]
            return (
              <fieldset>
                <legend>
                  {row().name} · {row().account_label ?? row().ref.source}
                </legend>
                <Checkbox
                  checked={!off()}
                  onChange={(checked) =>
                    props.update({
                      mcp: {
                        ...selection(),
                        disabled_connections: checked
                          ? selection().disabled_connections.filter((ref) => !matches(ref))
                          : [...selection().disabled_connections, row().ref],
                      },
                    })
                  }
                >
                  Use {row().name}
                </Checkbox>
                <Show when={!row().available}>
                  <small>Currently unavailable</small>
                </Show>
                <For each={names()}>
                  {(name) => (
                    <Checkbox
                      disabled={off()}
                      description={
                        row().tools.find((tool) => tool.name === name)?.description ?? "Currently unavailable"
                      }
                      checked={!off() && !excluded().includes(name)}
                      onChange={(checked) =>
                        props.update({
                          mcp: {
                            ...selection(),
                            disabled_tools: checked
                              ? selection().disabled_tools.filter((tool) => !matches(tool) || tool.tool_name !== name)
                              : [...selection().disabled_tools, { ...row().ref, tool_name: name }],
                          },
                        })
                      }
                    >
                      {name}
                    </Checkbox>
                  )}
                </For>
              </fieldset>
            )
          }}
        </For>
      </fieldset>
    </>
  )
}
