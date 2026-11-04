import { expect, mock, spyOn, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { browserSuite } from "@/test/browser"
import { createMenuDismissController } from "./menu-dismiss"
import { createMenuDismissState, transitionMenuDismiss } from "./menu-dismiss-machine"

browserSuite(import.meta.path, () => {
  test.each(["frames", "deadline", "reopen", "owner", "dispose", "late-picker"] as const)(
    "deferred menu actions settle once and release their work: %s",
    async (scenario) => {
      const frames = new Map<number, FrameRequestCallback>()
      const timers = new Map<number, () => void>()
      let id = 0
      const originalFrame = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame")
      const originalCancel = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame")
      Object.defineProperties(globalThis, {
        requestAnimationFrame: {
          configurable: true,
          value: (cb: FrameRequestCallback) => {
            frames.set(++id, cb)
            return id
          },
        },
        cancelAnimationFrame: { configurable: true, value: (id: number) => frames.delete(id) },
      })
      const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((cb: () => void) => {
        timers.set(++id, cb)
        return id
      }) as typeof setTimeout)
      const clear = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) =>
        timers.delete(id)) as typeof clearTimeout)
      const flush = () => {
        const batch = [...frames.values()]
        frames.clear()
        batch.forEach((cb) => cb(0))
      }
      let dispose = () => {}
      try {
        const [owner, setOwner] = createSignal("first")
        const element = { isConnected: true } as HTMLElement
        const menu = createRoot((cleanup) => {
          dispose = cleanup
          return createMenuDismissController(() => element, owner)
        })
        await Promise.resolve()
        menu.opened()
        const close = menu.capture()
        const action = mock(() => {})
        if (scenario !== "late-picker") close.afterClose(action)
        const lateTimer = [...timers.values()][0]
        const lateFrame = [...frames.values()][0]
        if (scenario === "frames") {
          flush()
          expect(action).not.toHaveBeenCalled()
          Object.assign(element, { isConnected: false })
          flush()
          flush()
          expect(action).not.toHaveBeenCalled()
          flush()
          expect(action).toHaveBeenCalledTimes(1)
          lateTimer()
          close.afterClose(action)
        } else if (scenario === "deadline") {
          lateTimer()
          lateFrame(0)
          close.afterClose(action)
        } else if (scenario === "owner") {
          setOwner("second")
          await Promise.resolve()
          lateTimer()
          lateFrame(0)
        } else if (scenario === "dispose") {
          dispose()
          lateTimer()
          lateFrame(0)
        } else {
          menu.opened()
          close.afterClose(action)
          lateTimer?.()
          lateFrame?.(0)
        }
        expect(action).toHaveBeenCalledTimes(["frames", "deadline"].includes(scenario) ? 1 : 0)
        expect(frames.size).toBe(0)
        expect(timers.size).toBe(0)
        expect(close.current()).toBe(["frames", "deadline"].includes(scenario))
      } finally {
        dispose()
        timeout.mockRestore()
        clear.mockRestore()
        for (const [key, descriptor] of [
          ["requestAnimationFrame", originalFrame],
          ["cancelAnimationFrame", originalCancel],
        ] as const) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor)
          else Reflect.deleteProperty(globalThis, key)
        }
      }
    },
  )
})

test("menu transitions reject stale attempts and keep focus policy through close", () => {
  const initial = createMenuDismissState<string>()
  const open = transitionMenuDismiss(initial, { type: "opened" }).state
  const externalFocus = transitionMenuDismiss(open, { type: "restore.changed", allow: false }).state
  const waiting = transitionMenuDismiss(externalFocus, { type: "scheduled", attempt: 1, action: "select" }).state
  expect(waiting).toEqual({ status: "waiting", attempt: 1, restoreTrigger: false, action: "select" })
  expect(transitionMenuDismiss(waiting, { type: "frame", attempt: 0, connected: false }).state).toBe(waiting)
  const next = transitionMenuDismiss(waiting, { type: "opened" }).state
  expect(next).toEqual({ status: "ready", attempt: 2, restoreTrigger: true })
  expect(transitionMenuDismiss(next, { type: "timed-out", attempt: 1 }).state).toBe(next)
  const disposed = transitionMenuDismiss(waiting, { type: "disposed" }).state
  expect(transitionMenuDismiss(disposed, { type: "opened" }).state).toBe(disposed)
  expect(initial).toEqual({ status: "ready", attempt: 0, restoreTrigger: true })
})
