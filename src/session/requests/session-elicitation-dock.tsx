import type { FormAnswer, FormField, FormStringField } from "@opencode/client/promise"
import type { FormWithLocation } from "@opencode/client/solid"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { LinkedText } from "@opencode/session-ui/linked-text"
import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Select } from "@opencode/ui/select"
import { TextInput } from "@opencode/ui/text-input"
import { For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { createElicitationDock, type ElicitationDrafts } from "./elicitation-controller"

const inputTypes = { email: "email", uri: "url", date: "date", "date-time": "text" } as const
function inputType(format: FormStringField["format"]) {
  return format ? inputTypes[format] : "text"
}

export function SessionElicitationDock(props: {
  request: FormWithLocation
  subagent?: string
  drafts: ElicitationDrafts
  busy: boolean
  respond: (request: FormWithLocation, answer?: FormAnswer) => void
}) {
  const language = useLanguage()
  const dock = createElicitationDock(props.request, props.drafts)
  const message = () => {
    const text = props.request.metadata?.message
    return typeof text === "string" ? text : undefined
  }
  const label = (field: FormField) => field.title || field.key
  const origin = () => {
    const directory = props.request.location?.directory
    if (directory) return language.t("session.elicitation.directory", { directory })
    if (props.subagent) return language.t("session.elicitation.subagent", { title: props.subagent })
  }
  let form!: HTMLFormElement
  return (
    <form
      ref={form}
      data-component="session-elicitation-dock"
      aria-label={props.request.title}
      aria-busy={props.busy}
      class="[--question-prompt-max-height:min(55dvh,480px)]"
      onSubmit={(event) => {
        event.preventDefault()
        if (!props.busy && dock.view().complete) props.respond(props.request, dock.view().answer)
      }}
    >
      <DockPrompt
        kind="question"
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.isComposing || event.repeat || props.busy) return
          if (event.key === "Escape") {
            event.preventDefault()
            props.respond(props.request)
          } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey) {
            event.preventDefault()
            form.requestSubmit()
          }
        }}
        header={
          <>
            <div data-slot="question-header-title">{props.request.title}</div>
            <div data-slot="question-details">
              <Show when={origin()}>{(text) => <div data-slot="question-hint">{text()}</div>}</Show>
              <Show when={message()}>
                {(text) => (
                  <div data-slot="question-text">
                    <LinkedText text={text()} />
                  </div>
                )}
              </Show>
            </div>
          </>
        }
        footer={
          <>
            <Button
              type="button"
              size="large"
              variant="ghost"
              disabled={props.busy}
              onClick={() => props.respond(props.request)}
            >
              {language.t("ui.common.dismiss")}
            </Button>
            <Button type="submit" size="large" variant="submit" disabled={props.busy || !dock.view().complete}>
              {language.t("ui.common.submit")}
            </Button>
          </>
        }
      >
        <div class="flex min-h-0 flex-col gap-3 overflow-y-auto p-1" data-scrollable>
          <For each={dock.view().fields}>
            {(field) => (
              <fieldset class="flex min-w-0 flex-col gap-1" disabled={props.busy}>
                <legend class="text-13-medium" classList={{ "sr-only": field.type === "boolean" }}>
                  {label(field)}
                  {"required" in field && field.required ? " *" : ""}
                </legend>
                <Show when={field.description}>
                  {(description) => (
                    <div class="text-12-regular text-text-weak">
                      <LinkedText text={description()} />
                    </div>
                  )}
                </Show>
                <Switch>
                  <Match when={field.type === "external" && field}>
                    {(external) => (
                      <div class="break-all text-13-regular">
                        <Show
                          when={/^https?:\/\//i.test(external().url) && URL.canParse(external().url)}
                          fallback={external().url}
                        >
                          <ExternalLink href={external().url}>{external().url}</ExternalLink>
                        </Show>
                      </div>
                    )}
                  </Match>
                  <Match when={field.type === "boolean"}>
                    <Checkbox
                      appearance="compact"
                      checked={dock.value(field) === true}
                      disabled={props.busy}
                      onChange={(checked) => dock.set(field, checked)}
                    >
                      {label(field)}
                    </Checkbox>
                  </Match>
                  <Match when={field.type === "multiselect" && field}>
                    {(multi) => (
                      <>
                        <Show when={multi().minItems}>
                          {(count) => (
                            <span class="text-12-regular text-text-weak">
                              {language.t("session.elicitation.minItems", { count: count() })}
                            </span>
                          )}
                        </Show>
                        <Show when={multi().maxItems !== undefined}>
                          <span class="text-12-regular text-text-weak">
                            {language.t("session.elicitation.maxItems", { count: multi().maxItems ?? 0 })}
                          </span>
                        </Show>
                        <For each={multi().options}>
                          {(option) => (
                            <Checkbox
                              appearance="compact"
                              disabled={props.busy}
                              checked={dock.selected(multi()).includes(option.value)}
                              onChange={(checked) => dock.toggle(multi(), option.value, checked)}
                            >
                              {option.label}
                            </Checkbox>
                          )}
                        </For>
                      </>
                    )}
                  </Match>
                  <Match when={field.type === "string" && field.options?.length ? field : undefined}>
                    {(choice) => (
                      <Select
                        aria-label={label(field)}
                        options={choice().options ?? []}
                        appearance="base"
                        current={choice().options?.find((option) => option.value === dock.value(field))}
                        value={(option) => option.value}
                        label={(option) => option.label}
                        placeholder={language.t("session.elicitation.selectPlaceholder")}
                        disabled={props.busy}
                        onSelect={(option) => dock.set(field, option?.value ?? "")}
                      />
                    )}
                  </Match>
                  <Match when={field.type === "string" && field}>
                    {(text) => (
                      <TextInput
                        type={inputType(text().format)}
                        aria-label={label(field)}
                        required={text().required}
                        placeholder={text().placeholder}
                        minLength={text().minLength}
                        maxLength={text().maxLength}
                        value={String(dock.value(field) ?? "")}
                        disabled={props.busy}
                        onInput={(event) => dock.set(field, event.currentTarget.value)}
                      />
                    )}
                  </Match>
                  <Match when={(field.type === "number" || field.type === "integer") && field}>
                    {(number) => (
                      <TextInput
                        type="number"
                        numeric
                        aria-label={label(field)}
                        required={number().required}
                        step={number().type === "integer" ? 1 : "any"}
                        min={number().minimum}
                        max={number().maximum}
                        value={String(dock.value(field) ?? "")}
                        disabled={props.busy}
                        onInput={(event) => dock.set(field, event.currentTarget.value)}
                      />
                    )}
                  </Match>
                </Switch>
              </fieldset>
            )}
          </For>
        </div>
      </DockPrompt>
    </form>
  )
}
