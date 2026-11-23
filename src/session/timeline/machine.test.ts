import { describe, expect, test } from "bun:test"
import { isAwayFromEnd, timelineScrollAction } from "./machine"

describe("timeline scroll intent", () => {
  test("pins a regrown layout until the reader interacts", () => {
    const reflow = { previous: { top: 90, max: 90 }, current: { top: 90, max: 100 }, paused: false }
    expect(timelineScrollAction({ ...reflow, readerInteracted: false })).toBe("pin")
    expect(timelineScrollAction({ ...reflow, readerInteracted: true })).toBe("forward")
    expect(timelineScrollAction({ ...reflow, readerInteracted: false, paused: true })).toBe("forward")
  })

  test("uses the same ten-pixel boundary for pinning and Jump to latest", () => {
    const following = { previous: { top: 100, max: 100 }, readerInteracted: false, paused: false }
    const boundary = { top: 90, max: 100 }
    const near = { top: 90.25, max: 100 }
    expect(isAwayFromEnd(boundary)).toBe(true)
    expect(timelineScrollAction({ ...following, current: boundary })).toBe("pin")
    expect(isAwayFromEnd(near)).toBe(false)
    expect(timelineScrollAction({ ...following, current: near })).toBe("forward")
  })

  test("holds a pause through a stale or subpixel event near the end", () => {
    const reading = { previous: { top: 95, max: 100 }, readerInteracted: true, paused: true }
    expect(timelineScrollAction({ ...reading, current: { top: 95, max: 100 } })).toBe("hold")
    expect(timelineScrollAction({ ...reading, current: { top: 95.5, max: 100 } })).toBe("hold")
    expect(timelineScrollAction({ ...reading, current: { top: 95.75, max: 100 } })).toBe("forward")
    expect(timelineScrollAction({ ...reading, current: { top: 94, max: 98 } })).toBe("forward")
  })

  test("forwards a scroll when content fits even without movement", () => {
    const reading = { readerInteracted: true, paused: true }
    const fits = { top: 0, max: 1 }
    const overflows = { top: 0, max: 2 }
    expect(timelineScrollAction({ ...reading, previous: fits, current: fits })).toBe("forward")
    expect(timelineScrollAction({ ...reading, previous: overflows, current: overflows })).toBe("hold")
  })
})
