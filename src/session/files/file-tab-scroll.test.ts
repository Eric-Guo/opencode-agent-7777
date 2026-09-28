import { describe, expect, test } from "bun:test"
import { createFileTabListSync, nextTabListScrollLeft } from "./file-tab-scroll"

describe("nextTabListScrollLeft", () => {
  test.each([
    [100, 120, 80, undefined],
    [100, 50, 80, 50],
    [100, 350, 80, 130],
    [100, 100, 300, undefined],
    [100, 150, 400, 150],
  ])("scroll %s with tab at %s of width %s yields %s", (scrollLeft, tabLeft, tabWidth, expected) => {
    expect(nextTabListScrollLeft({ scrollLeft, clientWidth: 300, tabLeft, tabWidth })).toBe(expected)
  })
})

test("tab strip handles wheel edges, resizes, selection and cleanup without scrolling its parent", () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis)
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  const observers: { callback: () => void; disconnected: boolean }[] = []
  class Observer {
    disconnected = false
    constructor(public callback: () => void) {
      observers.push(this)
    }
    observe() {}
    disconnect() {
      this.disconnected = true
    }
  }
  const globals = {
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      frames.set(++nextFrame, fn)
      return nextFrame
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    ResizeObserver: Observer,
    MutationObserver: Observer,
  }
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((fn) => fn(0))
  }
  const events = new EventTarget()
  let tabLeft = 700
  const item = { getBoundingClientRect: () => ({ left: 20 + tabLeft - el.scrollLeft, width: 100 }) }
  const el = Object.assign(events, {
    scrollLeft: 0,
    clientLeft: 0,
    clientWidth: 300,
    scrollWidth: 800,
    querySelector: () => ({ closest: () => item }),
    getBoundingClientRect: () => ({ left: 20 }),
  })
  const wheel = (deltaY: number, other = {}) => {
    const event = Object.assign(new Event("wheel", { cancelable: true }), { deltaY, deltaX: 0, ...other })
    el.dispatchEvent(event)
    return event.defaultPrevented
  }
  let sync: ReturnType<typeof createFileTabListSync> | undefined
  let dragging = false
  try {
    sync = createFileTabListSync({ el: el as unknown as HTMLDivElement, dragging: () => dragging })
    flush()
    expect(el.scrollLeft).toBe(500)
    expect(wheel(100)).toBe(false)
    expect(wheel(-100)).toBe(true)
    expect(el.scrollLeft).toBe(450)
    expect(wheel(-100, { ctrlKey: true })).toBe(false)
    expect(wheel(-100, { shiftKey: true })).toBe(false)
    expect(wheel(-100, { deltaX: 150 })).toBe(false)
    expect(el.scrollLeft).toBe(450)
    tabLeft = 0
    dragging = true
    observers[1].callback()
    flush()
    expect(el.scrollLeft).toBe(450)
    dragging = false
    sync.schedule()
    sync.schedule()
    expect(frames.size).toBe(1)
    flush()
    expect(el.scrollLeft).toBe(0)
    expect(wheel(-100)).toBe(false)
    tabLeft = 250
    el.clientWidth = 200
    observers[0].callback()
    flush()
    expect(el.scrollLeft).toBe(150)
    el.scrollWidth = 200
    el.scrollLeft = 0
    expect(wheel(100)).toBe(false)
    observers[1].callback()
    sync.dispose()
    expect(frames.size).toBe(0)
    expect(observers.every((observer) => observer.disconnected)).toBe(true)
    el.scrollWidth = 800
    expect(wheel(100)).toBe(false)
    expect(el.scrollLeft).toBe(0)
  } finally {
    sync?.dispose()
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
