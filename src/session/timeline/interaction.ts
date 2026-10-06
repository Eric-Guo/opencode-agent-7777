import { createAutoScroll } from "@opencode/ui/hooks"
import { isScrollKeyTarget, scrollKey, scrollKeyOwner } from "@opencode/ui/scroll-view"
import { createEffect, on, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"

export function createSessionTimelineInteraction(input: {
  identity: Accessor<unknown>
  items: Accessor<readonly unknown[]>
}) {
  const [state, setState] = createStore({
    scroller: undefined as HTMLElement | undefined,
    content: undefined as HTMLElement | undefined,
    jump: false,
  })
  // The bounded timeline follows layout changes even after a turn finishes
  // (for example, images loading). User scroll/selection pauses the shared helper.
  const follow = createAutoScroll({ working: () => true })
  let position = { top: 0, max: 0 }
  const readPosition = () => {
    const el = state.scroller
    return el ? { top: el.scrollTop, max: el.scrollHeight - el.clientHeight } : { top: 0, max: 0 }
  }
  let frame: number | undefined
  const updateScrollState = () => {
    const el = state.scroller
    setState("jump", !!el && follow.userScrolled() && el.scrollHeight - el.clientHeight - el.scrollTop >= 10)
  }
  const schedule = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      follow.scrollToBottom()
      updateScrollState()
    })
  }
  createEffect(
    on(input.identity, () => {
      follow.resume()
      schedule()
    }),
  )
  createEffect(on(input.items, schedule))
  createEffect(updateScrollState)
  createEffect(() => {
    const elements = [state.scroller, state.content].filter((el): el is HTMLElement => !!el)
    // Composer, request dock and window resizing can change the viewport
    // without resizing the content. Content growth also updates Jump to latest
    // when text selection paused following before the viewport moved.
    const observer = new ResizeObserver(schedule)
    elements.forEach((el) => observer.observe(el))
    onCleanup(() => observer.disconnect())
  })
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
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
    actions: {
      resume: () => {
        follow.resume()
        updateScrollState()
      },
    },
    view: {
      onKeyDown: (event: KeyboardEvent) => {
        const el = state.scroller
        const key = scrollKey(event)
        if (!el || !key || !isScrollKeyTarget(event.target, key)) return
        if (scrollKeyOwner(el, event.target, key) !== el) return
        // Pause before ScrollView's smooth keyboard navigation starts. A resize
        // in the same frame must not pull the reader back to the latest message.
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
        // A delayed scroll event or the first smooth-scroll tick can still be
        // at the end after an upward key paused following. As in the main
        // timeline, resume only on arrival (downward movement or a collapse).
        const arrived = position.top > previous.top + 0.5 || position.max < previous.max
        const resting = position.max > 1 && position.max - position.top < 10 && !arrived
        if (!follow.userScrolled() || !resting) follow.handleScroll()
        updateScrollState()
      },
      markUserScroll,
    },
  }
}
