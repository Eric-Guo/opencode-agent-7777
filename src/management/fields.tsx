import { For, Show, createEffect, on, type JSX } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Schema } from "effect"
import type { Nexus } from "@opencode/schema/nexus"

type Field = {
  type?: string | string[]
  title?: string
  description?: string
  enum?: Schema.Json[]
  properties?: Record<string, Field>
  additionalProperties?: Field | boolean
  writeOnly?: boolean
  default?: Schema.Json
  [key: string]: unknown
}

export function FieldRow(props: { label: string; children: JSX.Element; description?: string }) {
  return (
    <label class="nexus-field">
      <span>{props.label}</span>
      {props.children}
      <Show when={props.description}>
        <small>{props.description}</small>
      </Show>
    </label>
  )
}

export function JsonInput(props: {
  value: unknown
  label: string
  change(value: Schema.Json): void
  valid?(value: boolean): void
}) {
  const [s, set] = createStore({ text: JSON.stringify(props.value, null, 2), error: "" })
  let input!: HTMLTextAreaElement
  createEffect(
    on(
      () => JSON.stringify(props.value, null, 2),
      (text) => {
        set({ text, error: "" })
        input?.setCustomValidity("")
        props.valid?.(true)
      },
    ),
  )

  return (
    <FieldRow label={props.label}>
      <textarea
        rows={6}
        value={s.text}
        onInput={(event) => {
          set("text", event.currentTarget.value)
          const value = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(s.text)
          set("error", value._tag === "None" ? "Enter valid JSON before saving." : "")

          if (value._tag === "Some") {
            try {
              props.change(value.value)
            } catch (error) {
              set("error", error instanceof Error ? error.message : String(error))
            }
          }

          event.currentTarget.setCustomValidity(s.error)
          props.valid?.(!s.error)
        }}
        ref={input}
        aria-invalid={!!s.error}
      />
      <small role="status">{s.error}</small>
    </FieldRow>
  )
}

export function ConfigurationForm(props: {
  schema: Schema.Json
  values: Record<string, Schema.Json>
  busy: boolean
  save(operations: Nexus.FieldOperation[]): Promise<boolean>
  models?: string[]
}) {
  const schema = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(props.schema) as Field
  const [s, set] = createStore({ operations: {} as Record<string, Nexus.FieldOperation>, reset: 1 })

  const change = (path: string[], op: Nexus.FieldOperation) =>
    set(
      "operations",
      reconcile({
        ...Object.fromEntries(
          Object.entries(s.operations).filter(
            ([, previous]) => !path.every((part, index) => previous.path[index] === part),
          ),
        ),
        [JSON.stringify(path)]: op,
      }),
    )

  const field = (definition: Field, path: [string, ...string[]], current: Schema.Json | undefined): JSX.Element => {
    const key = JSON.stringify(path)
    const operation = () => s.operations[key]

    const value = () =>
      operation()?.op === "set" ? (operation() as Extract<Nexus.FieldOperation, { op: "set" }>).value : current

    const update = (value: Schema.Json) => change(path, { op: "set", path, value })
    const type = Array.isArray(definition.type) ? definition.type.find((type) => type !== "null") : definition.type

    if (
      !definition["x-nexus-atomic"] &&
      (definition.properties ||
        (definition.additionalProperties && typeof definition.additionalProperties === "object"))
    ) {
      const [group, setGroup] = createStore({ name: "", added: [] as string[] })

      const members =
        current && typeof current === "object" && !Array.isArray(current) ? (current as Schema.JsonObject) : {}

      const entries = () => [
        ...new Set([...Object.keys(definition.properties ?? {}), ...Object.keys(members), ...group.added]),
      ]

      return (
        <fieldset>
          <legend>{definition.title ?? path.at(-1)}</legend>
          <For each={entries()}>
            {(name) =>
              field(
                definition.properties?.[name] ??
                  (typeof definition.additionalProperties === "object" ? definition.additionalProperties : {}),
                [...path, name],
                members[name],
              )
            }
          </For>
          <Show when={typeof definition.additionalProperties === "object"}>
            <FieldRow label={`New ${path.at(-1)} entry`}>
              <input value={group.name} onInput={(event) => setGroup("name", event.currentTarget.value)} />
            </FieldRow>
            <Button
              disabled={props.busy || !group.name.trim() || entries().includes(group.name.trim())}
              onClick={() => {
                const name = group.name.trim()
                setGroup({ added: [...group.added, name], name: "" })
                change([...path, name], { op: "set", path: [...path, name], value: {} })
              }}
            >
              Add entry
            </Button>
          </Show>
          <Button disabled={props.busy} onClick={() => change(path, { op: "unset", path })}>
            Restore {definition.title ?? path.at(-1)} default
          </Button>
        </fieldset>
      )
    }

    return (
      <div class="nexus-field-group">
        <FieldRow label={definition.title ?? path.at(-1)!} description={definition.description}>
          <Show
            when={!definition.writeOnly}
            fallback={
              <input
                type="password"
                autocomplete="new-password"
                placeholder="Keep saved secret"
                onInput={(e) => update(e.currentTarget.value)}
              />
            }
          >
            <Show
              when={definition.enum}
              fallback={
                type === "boolean" ? (
                  <input type="checkbox" checked={value() === true} onChange={(e) => update(e.currentTarget.checked)} />
                ) : type === "string" ? (
                  <input
                    value={typeof value() === "string" ? String(value()) : ""}
                    list={definition["x-nexus-choices"] ? "nexus-model-choices" : undefined}
                    onInput={(e) => {
                      if (
                        !e.currentTarget.value &&
                        Array.isArray(definition.type) &&
                        definition.type.includes("null")
                      ) {
                        change(path, { op: "unset", path })
                        return
                      }
                      update(e.currentTarget.value)
                    }}
                  />
                ) : type === "number" || type === "integer" ? (
                  <input
                    type="number"
                    step={type === "integer" ? 1 : "any"}
                    value={Number(value() ?? 0)}
                    onInput={(e) => update(e.currentTarget.valueAsNumber)}
                  />
                ) : (
                  <JsonInput label="Value" value={value() ?? {}} change={update} />
                )
              }
            >
              {(values) => (
                <select
                  value={JSON.stringify(value())}
                  onChange={(e) =>
                    update(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(e.currentTarget.value))
                  }
                >
                  <For each={values()}>
                    {(choice) => <option value={JSON.stringify(choice)}>{String(choice ?? "Not set")}</option>}
                  </For>
                </select>
              )}
            </Show>
          </Show>
        </FieldRow>
        <div class="nexus-actions">
          <Button size="small" onClick={() => change(path, { op: "unset", path })}>
            Restore default
          </Button>
          <Show when={definition.writeOnly}>
            <Button size="small" onClick={() => update("")}>
              Clear secret
            </Button>
          </Show>
          <Show when={operation()}>
            <small>{operation()?.op === "unset" ? "Default on save" : "Changed"}</small>
          </Show>
        </div>
      </div>
    )
  }

  const discard = () => {
    set("operations", reconcile({}))
    set("reset", (n) => n + 1)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void props.save(Object.values(s.operations)).then((saved) => {
          if (saved) discard()
        })
      }}
    >
      <datalist id="nexus-model-choices">
        <For each={props.models}>{(model) => <option value={model} />}</For>
      </datalist>
      <Show when={s.reset} keyed>
        {(_generation) => (
          <For each={Object.entries(schema.properties ?? {})}>
            {([name, definition]) => field(definition, [name], props.values[name])}
          </For>
        )}
      </Show>
      <div class="nexus-actions">
        <Button type="submit" disabled={props.busy || !Object.keys(s.operations).length}>
          Save
        </Button>
        <Button disabled={props.busy} onClick={discard}>
          Discard
        </Button>
      </div>
    </form>
  )
}
