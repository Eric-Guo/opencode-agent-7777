import { expect, spyOn, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { browserSuite } from "./server/runtime.test-fixture"
import { installDOM } from "@/test/dom"
import { createAnimatedPresence } from "./animated-presence"

browserSuite(import.meta.path, () => {
  test.each(["deadline", "reappear", "identity", "element", "dispose"] as const)(
    "animated presence releases missing completion events: %s",
    async (scenario) => {
      const cleanup = installDOM()
      const timers = new Map<number, () => void>()
      let id = 0
      const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((cb: () => void) => {
        timers.set(++id, cb)
        return id
      }) as typeof setTimeout)
      const clear = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) =>
        timers.delete(id)) as typeof clearTimeout)
      const previous = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle")
      Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({
          display: "block",
          animationName: "exit",
          animationDuration: "0.15s",
          animationDelay: "0s",
        }),
      })
      let dispose = () => {}
      try {
        const [value, setValue] = createSignal<string | undefined>("queue")
        const [identity, setIdentity] = createSignal("first")
        const element = document.createElement("button")
        document.body.append(element)
        const [ref, setRef] = createSignal<HTMLElement | null>(element)
        const presence = createRoot((cleanup) => {
          dispose = cleanup
          return createAnimatedPresence(value, ref, identity)
        })
        await Promise.resolve()
        expect(presence.animate()).toBe(false)
        setValue(undefined)
        expect(presence.show()).toBe(false)
        expect(presence.value()).toBe("queue")
        await Promise.resolve()
        expect(presence.state()).toBe("hiding")
        const late = [...timers.values()][0]
        if (scenario === "reappear") setValue("steer")
        if (scenario === "identity") setIdentity("second")
        if (scenario === "element") setRef(null)
        if (scenario === "dispose") dispose()
        await Promise.resolve()
        late?.()
        expect(presence.state()).toBe(scenario === "reappear" ? "present" : "hidden")
        expect(presence.value()).toBe(scenario === "identity" ? undefined : scenario === "reappear" ? "steer" : "queue")
        expect(timeout).toHaveBeenLastCalledWith(expect.any(Function), 200)
        expect(timers.size).toBe(0)
      } finally {
        dispose()
        timeout.mockRestore()
        clear.mockRestore()
        if (previous) Object.defineProperty(globalThis, "getComputedStyle", previous)
        else Reflect.deleteProperty(globalThis, "getComputedStyle")
        cleanup()
      }
    },
  )
})
