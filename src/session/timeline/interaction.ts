import { createAutoScroll } from "@opencode/ui/hooks"
import { isScrollKeyTarget, scrollKey, scrollKeyOwner } from "@opencode/ui/scroll-view"
import { createEffect, on, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { BOTTOM_THRESHOLD, isAwayFromEnd, timelineScrollAction, type TimelinePosition } from "./machine"

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
  const updateJump = (current?: TimelinePosition) =>
    setState("jump", follow.userScrolled() && isAwayFromEnd(current ?? readPosition()))
  let historyAnchor: ResizeObserver | undefined
  const releaseAnchor = () => {
    historyAnchor?.disconnect()
    historyAnchor = undefined
  }
  onCleanup(releaseAnchor)
  const resume = () => {
    releaseAnchor()
    readerInteracted = false
    follow.resume()
    position = readPosition()
  }
  const jumpToMessage = (id: string) => {
    const el = state.scroller
    const row = el?.querySelector<HTMLElement>(`[data-timeline-row="UserMessage"][data-message-id="${CSS.escape(id)}"]`)
    if (!el || !row) return
    releaseAnchor()
    readerInteracted = true
    follow.pause()
    // Only move the transcript. The embedding page can have a scroll container of its own.
    el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientTop
    follow.handleScroll()
    el.focus({ preventScroll: true })
    position = readPosition()
    updateJump(position)
  }
  createEffect(on(input.identity, resume))

  // createAutoScroll observes both elements and pins in the resize delivery. While reading,
  // content or composer growth can reveal Jump to latest without a viewport scroll event.
  createEffect(() => {
    updateJump()
    if (!follow.userScrolled()) return
    const observer = new ResizeObserver(() => updateJump())
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
    actions: { resume, jumpToMessage },
    view: {
      preserveReadingPosition: () => {
        const viewport = state.scroller
        const content = state.content
        if (!viewport || !content) return
        const top = viewport.getBoundingClientRect().top
        const anchor = Array.from(content.querySelectorAll(".chat-turn")).find(
          (turn) => turn.getBoundingClientRect().bottom > top,
        )
        if (!anchor) return
        releaseAnchor()
        follow.pause()
        const offset = anchor.getBoundingClientRect().top
        const restore = () => {
          if (!anchor.isConnected) return releaseAnchor()
          viewport.scrollTop += anchor.getBoundingClientRect().top - offset
        }
        return () => {
          restore()
          // Offscreen message parts acquire their measured heights after the prepend.
          historyAnchor = new ResizeObserver(restore)
          historyAnchor.observe(content)
        }
      },
      markInput: () => {
        releaseAnchor()
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
        const action = timelineScrollAction({
          previous,
          current: position,
          readerInteracted,
          paused: follow.userScrolled(),
        })
        if (action === "pin") return follow.scrollToBottom()
        if (action === "forward") follow.handleScroll()
        updateJump(position)
      },
      markUserScroll,
    },
  }
}
