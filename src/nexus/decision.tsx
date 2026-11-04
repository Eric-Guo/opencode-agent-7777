import { For, Show, createMemo, createSignal } from "solid-js"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Button } from "@opencode/ui/button"
import type { JsonObject } from "@cybros/agent"
import { useLanguage, translateSync } from "../runtime/i18n/language"
import { PermissionPrompt } from "../session/requests/permission-prompt"
import type { Decision, Resolution } from "./chat"

type Field = { name: string; label: string; type: string; required: boolean; options?: string[] }
export function answerFields(fields: Field[], form: FormData) {
  const answer: JsonObject = {}
  for (const field of fields) {
    if (!field.required && !form.has("include:" + field.name)) continue
    const values = form.getAll("value:" + field.name).map(String)
    const value = values[0] ?? ""
    if (["number", "integer"].includes(field.type)) {
      const n = Number(value)
      if (!value.trim() || !Number.isFinite(n) || (field.type === "integer" && !Number.isSafeInteger(n)))
        throw new Error(translateSync("nexus.number", { field: field.label }))
      answer[field.name] = n
    } else if (field.type === "boolean") answer[field.name] = value === "true"
    else if (field.type === "multichoice") answer[field.name] = values
    else answer[field.name] = value
  }
  return answer
}
export function DecisionDock(props: { decision: Decision; sending: boolean; reply: (response: Resolution) => void }) {
  const language = useLanguage()
  const d = () => props.decision
  const fields = createMemo(() => (d().fields ?? []) as unknown as Field[])
  const options = () => d().options ?? []
  const [error, setError] = createSignal("")
  let form!: HTMLFormElement
  function submit() {
    if (!form.reportValidity()) return
    const data = new FormData(form)
    try {
      const answer = fields().length ? answerFields(fields(), data) : data.getAll("reply").map(String).join("\n")
      setError("")
      props.reply({ action: "answer", answer })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid answer")
    }
  }
  return (
    <Show
      when={d().kind === "ask"}
      fallback={
        <PermissionPrompt
          title={d().tool || language.t("notification.permission.title")}
          resources={[JSON.stringify(d().tool_input ?? {})]}
          allowAlways={false}
          responding={props.sending}
          onDecide={(choice) => props.reply({ action: choice === "reject" ? "deny" : "approve" })}
        />
      }
    >
      <DockPrompt
        kind="question"
        header={<strong>{d().prompt || language.t("nexus.question")}</strong>}
        footer={
          <Button disabled={props.sending} onClick={submit}>
            {language.t("nexus.sendAnswer")}
          </Button>
        }
      >
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          class="grid gap-3 overflow-auto max-h-72"
        >
          <For each={fields()}>
            {(field) => {
              const name = "value:" + field.name
              let group!: HTMLFieldSetElement
              return (
                <div>
                  <Show when={!field.required}>
                    <label>
                      <input
                        name={"include:" + field.name}
                        type="checkbox"
                        onChange={(e) => {
                          group.disabled = !e.currentTarget.checked
                        }}
                      />{" "}
                      {language.t("nexus.include", { field: field.label })}
                    </label>
                  </Show>
                  <fieldset ref={group} disabled={!field.required}>
                    <label>
                      {field.label}
                      <Show
                        when={["boolean", "choice", "multichoice"].includes(field.type)}
                        fallback={
                          <input
                            class="border rounded px-2"
                            name={name}
                            type={field.type === "string" ? "text" : "number"}
                            required={field.type !== "string"}
                            step={field.type === "integer" ? "1" : "any"}
                          />
                        }
                      >
                        <select
                          name={name}
                          multiple={field.type === "multichoice"}
                          required={field.type !== "multichoice"}
                        >
                          <Show when={field.type !== "multichoice"}>
                            <option value="">{language.t("nexus.choose")}</option>
                          </Show>
                          <For each={field.type === "boolean" ? ["true", "false"] : field.options}>
                            {(value) => (
                              <option value={value}>
                                {field.type === "boolean"
                                  ? language.t(value === "true" ? "nexus.yes" : "nexus.no")
                                  : value}
                              </option>
                            )}
                          </For>
                        </select>
                      </Show>
                    </label>
                  </fieldset>
                </div>
              )
            }}
          </For>
          <Show when={!fields().length}>
            <Show
              when={options().length}
              fallback={<textarea name="reply" required aria-label={language.t("nexus.answer")} />}
            >
              <select name="reply" required multiple={!!d().multi} aria-label={language.t("nexus.answer")}>
                <For each={options()}>{(value) => <option>{value}</option>}</For>
              </select>
            </Show>
          </Show>
          <Show when={error()}>
            <span role="alert">{error()}</span>
          </Show>
        </form>
      </DockPrompt>
    </Show>
  )
}
