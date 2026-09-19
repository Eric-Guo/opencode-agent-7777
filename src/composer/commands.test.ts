import { describe, expect, mock, test } from "bun:test"
import { createModelSelection } from "@/providers/models/selection"
import { composerModelCommand, useComposerCommands } from "./commands"

function keyEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: "F2",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
    repeat: false,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
    ...overrides,
  } as KeyboardEvent
}

describe("composer model commands", () => {
  test("matches forward, reverse, and platform-specific thinking effort shortcuts", () => {
    expect(composerModelCommand(keyEvent(), true)).toBe("model.cycle")
    expect(composerModelCommand(keyEvent({ shiftKey: true }), false)).toBe("model.cycle.reverse")
    expect(composerModelCommand(keyEvent({ key: "D", shiftKey: true, metaKey: true }), true)).toBe(
      "model.variant.cycle",
    )
    expect(composerModelCommand(keyEvent({ key: "d", shiftKey: true, ctrlKey: true }), false)).toBe(
      "model.variant.cycle",
    )
    expect(composerModelCommand(keyEvent({ key: "d", shiftKey: true, ctrlKey: true }), true)).toBeUndefined()
    expect(composerModelCommand(keyEvent({ key: "D", shiftKey: true, metaKey: true }), false)).toBeUndefined()
  })

  test.each([
    { isComposing: true },
    { defaultPrevented: true },
    { repeat: true },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { key: "Enter" },
    { key: "d", ctrlKey: true },
    { key: "d", ctrlKey: true, metaKey: true, shiftKey: true },
  ])("leaves unrelated or already handled input alone: %j", (overrides) => {
    expect(composerModelCommand(keyEvent(overrides), true)).toBeUndefined()
    expect(composerModelCommand(keyEvent(overrides), false)).toBeUndefined()
  })

  test("blocks disabled and unavailable actions without consuming the key", () => {
    const selection = createModelSelection()
    const cycle = mock(() => {})
    const variantCycle = mock(() => {})
    let disabled = true
    let available = true
    const model = {
      ...selection,
      recent: () => (available ? [{} as ReturnType<typeof selection.recent>[number]] : []),
      cycle,
      variant: { ...selection.variant, list: () => (available ? ["low"] : []), cycle: variantCycle },
    }
    const commands = useComposerCommands({ model: () => model, disabled: () => disabled, isMac: false })
    const blocked = keyEvent()
    expect(commands.onKeyDown(blocked)).toBe(false)
    expect(blocked.preventDefault).not.toHaveBeenCalled()
    expect(cycle).not.toHaveBeenCalled()
    disabled = false
    available = false
    expect(commands.onKeyDown(blocked)).toBe(false)
    const effort = keyEvent({ key: "d", ctrlKey: true, shiftKey: true })
    expect(commands.onKeyDown(effort)).toBe(false)
    expect(effort.preventDefault).not.toHaveBeenCalled()
    expect(variantCycle).not.toHaveBeenCalled()

    available = true
    expect(commands.onKeyDown(blocked)).toBe(true)
    expect(cycle).toHaveBeenLastCalledWith(1)
    expect(blocked.preventDefault).toHaveBeenCalledTimes(1)
    expect(blocked.stopPropagation).toHaveBeenCalledTimes(1)
    expect(commands.onKeyDown(keyEvent({ shiftKey: true }))).toBe(true)
    expect(cycle).toHaveBeenLastCalledWith(-1)
    expect(commands.onKeyDown(effort)).toBe(true)
    expect(variantCycle).toHaveBeenCalledTimes(1)
  })
})
