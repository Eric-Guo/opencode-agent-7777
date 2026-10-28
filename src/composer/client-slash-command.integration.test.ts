import { expect, mock, test } from "bun:test"
import { renderToString } from "solid-js/web"
import { installDOM } from "@/test/dom"
import { createPromptState } from "./state"
import { createClientSlashCommands } from "./client-slash-command"
import { createComposerEditor } from "./editor/interaction"

function fixture(run: (fixture: ReturnType<typeof setup>) => void, trigger = "export") {
  const cleanup = installDOM()
  const previous = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame")
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: () => 1 })
  try {
    renderToString(() => {
      run(setup(trigger))
      return ""
    })
  } finally {
    if (previous) Object.defineProperty(globalThis, "requestAnimationFrame", previous)
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame")
    cleanup()
  }
}

function setup(trigger: string) {
  const draft = createPromptState({
    prompt: `/${trigger}`,
    attachments: [{ id: "image", filename: "test.png", mime: "image/png", url: "data:image/png;base64,aGVsbG8=" }],
  })
  const action = mock(() => {})
  const submit = mock((_options: { delivery: string }) => {})
  const error = mock(() => {})
  const command = { id: `session.${trigger}`, trigger, title: trigger, onSelect: action }
  const commands = createClientSlashCommands({
    commands: () => [command],
    draft,
    beforeSelect: () => controller.resetHistory(),
    onArguments: error,
  })
  const controller = createComposerEditor({
    store: draft.store,
    commands: commands.suggestions,
    context: () => [],
    searchContextFiles: () => [],
    onSuggestionSelect: (item) => commands.select(item.id),
    view: {
      submit: {
        stopping: () => false,
        onSubmit: () => {
          if (!commands.submit(draft.current())) submit({ delivery: "steer" })
        },
        onStop() {},
      },
    },
  })
  return {
    draft,
    action,
    submit,
    error,
    controller,
    option: { ...command, kind: "command" as const, label: `/${trigger}` },
  }
}

test.each(["export", "context"])(
  "submits /%s locally without a server command catalog, preserving attachments",
  (trigger) => {
    fixture(({ draft, action, submit, controller }) => {
      const attachments = draft.capture().attachments
      controller.submit()
      expect(action).toHaveBeenCalledTimes(1)
      expect(submit).not.toHaveBeenCalled()
      expect(draft.current()).toBe("")
      expect(draft.attachments()).toEqual(attachments)
    }, trigger)
  },
)

test.each(["export", "context"])(
  "rejects unexpected /%s arguments without sending or clearing the draft",
  (trigger) => {
    fixture(({ draft, action, submit, error, controller }) => {
      draft.set(`/${trigger} keep this text`)
      controller.submit()
      expect(action).not.toHaveBeenCalled()
      expect(submit).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(`/${trigger}`)
      expect(draft.current()).toBe(`/${trigger} keep this text`)
    }, trigger)
  },
)

test.each(["export", "context"])(
  "selecting the inline /%s suggestion executes locally and preserves attachments",
  (trigger) => {
    fixture(({ draft, action, submit, controller, option }) => {
      controller.onInput(`/${trigger.slice(0, 3)}`)
      const attachments = draft.capture().attachments
      controller.dispatch({ type: "popover.select", item: option })
      expect(action).toHaveBeenCalledTimes(1)
      expect(submit).not.toHaveBeenCalled()
      expect(draft.current()).toBe("")
      expect(draft.attachments()).toEqual(attachments)
    }, trigger)
  },
)

test.each(["export", "context"])(
  "selecting /%s from the command menu preserves an existing draft and its mentions",
  (trigger) => {
    fixture(({ draft, action, submit, controller, option }) => {
      draft.restore({
        prompt: "@notes.md review this",
        attachments: [],
        references: [{ type: "file", path: "notes.md", content: "@notes.md", start: 0, end: 9 }],
      })
      controller.openCommands()
      controller.dispatch({ type: "popover.select", item: option })
      expect(action).toHaveBeenCalledTimes(1)
      expect(submit).not.toHaveBeenCalled()
      expect(draft.capture()).toEqual({
        prompt: "@notes.md review this",
        attachments: [],
        references: [{ type: "file", path: "notes.md", content: "@notes.md", start: 0, end: 9 }],
      })
    }, trigger)
  },
)

test("ordinary prompts still use the server submission path", () => {
  fixture(({ draft, action, submit, controller }) => {
    draft.set("Explain this code")
    controller.submit()
    expect(action).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledWith({ delivery: "steer" })
  })
})
