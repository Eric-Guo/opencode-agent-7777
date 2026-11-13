import { createAutoScroll } from "@opencode/ui/hooks"
import { isScrollKeyTarget, scrollKey, scrollKeyOwner } from "@opencode/ui/scroll-view"
import { createEffect, on, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"

const BOTTOM_THRESHOLD = 10

export function createSessionTimelineInteraction(input: { identity: Accessor<unknown> }) {
  const [state, setState] = createStore({
    scroller: undefined as HTMLElement | undefined,
    content: undefined as HTMLElement | undefined,
    jump: false,
  })
  const follow = createAutoScroll({ working: () => true, bottomThreshold: BOTTOM_THRESHOLD })
  let readerInteracted = false
  let position = { top: 0, max: 0 }
  const readPosition = () => {
    const el = state.scroller
    return el ? { top: el.scrollTop, max: el.scrollHeight - el.clientHeight } : { top: 0, max: 0 }
  }
  const updateJump = () => {
    const el = state.scroller
    setState(
      "jump",
      follow.userScrolled() && !!el && el.scrollHeight - el.clientHeight - el.scrollTop >= BOTTOM_THRESHOLD,
    )
  }
  const resume = () => {
    readerInteracted = false
    follow.resume()
    position = readPosition()
  }
  createEffect(on(input.identity, resume))

  // createAutoScroll observes both elements and pins in the resize delivery. While reading,
  // content or composer growth can reveal Jump to latest without a viewport scroll event.
  createEffect(() => {
    updateJump()
    if (!follow.userScrolled()) return
    const observer = new ResizeObserver(updateJump)
    if (state.scroller) observer.observe(state.scroller)
    if (state.content) observer.observe(state.content)
    onCleanup(() => observer.disconnect())
  })

  const markUserScroll = (target?: EventTarget | null) => {
    const element = target instanceof Element ? target : undefined
    const nested = element?.closest("[data-scrollable]")
    if (nested && nested !== state.scroller) return
    follow.handleInteraction()
  }

  return {
    scroller: () => state.scroller,
    scroll: state,
    actions: { resume },
    view: {
      markInput: () => {
        readerInteracted = true
      },
      onKeyDown: (event: KeyboardEvent) => {
        const el = state.scroller
        const key = scrollKey(event)
        if (!el || !key || !isScrollKeyTarget(event.target, key)) return
        if (scrollKeyOwner(el, event.target, key) !== el) return
        if (key === "up" || key === "page-up" || key === "home") {
          position = readPosition()
          follow.pause()
        }
      },
      setScrollRef: (element: HTMLElement | undefined) => {
        setState("scroller", element)
        follow.scrollRef(element)
      },
      setContentRef: (element: HTMLElement | undefined) => {
        setState("content", element)
        follow.contentRef(element)
      },
      onScroll: () => {
        const previous = position
        position = readPosition()
        const distance = position.max - position.top
        if (!readerInteracted && !follow.userScrolled() && distance >= BOTTOM_THRESHOLD) {
          // Layout can clamp the offset, then grow the range again before the browser delivers
          // its scroll event. On activation or explicit resume the reader is still at the end.
          follow.scrollToBottom()
          return
        }
        // A delayed event resting at the end must not cancel an upward key or a text selection.
        const arrived = position.top > previous.top + 0.5 || position.max < previous.max
        if (!follow.userScrolled() || position.max <= 1 || distance >= BOTTOM_THRESHOLD || arrived)
          follow.handleScroll()
        updateJump()
      },
      markUserScroll,
    },
  }
}
