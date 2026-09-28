// Keep the selected tab visible without scrolling the surrounding embedded page.
export function nextTabListScrollLeft(input: {
  scrollLeft: number
  clientWidth: number
  tabLeft: number
  tabWidth: number
}) {
  if (input.tabLeft < input.scrollLeft || input.tabWidth > input.clientWidth) return input.tabLeft
  const right = input.tabLeft + input.tabWidth
  if (right > input.scrollLeft + input.clientWidth) return right - input.clientWidth
}

export function createFileTabListSync(input: { el: HTMLDivElement; dragging?: () => boolean }) {
  let frame: number | undefined
  const schedule = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (input.dragging?.()) return
      const tab = input.el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!tab) return
      const item = tab.closest<HTMLElement>('[data-slot="tabs-v2-trigger-wrapper"]') ?? tab
      const bounds = input.el.getBoundingClientRect()
      const rect = item.getBoundingClientRect()
      const left = nextTabListScrollLeft({
        scrollLeft: input.el.scrollLeft,
        clientWidth: input.el.clientWidth,
        tabLeft: rect.left - bounds.left - input.el.clientLeft + input.el.scrollLeft,
        tabWidth: rect.width,
      })
      if (left !== undefined) input.el.scrollLeft = left
    })
  }
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    const max = input.el.scrollWidth - input.el.clientWidth
    const next = Math.max(0, Math.min(max, input.el.scrollLeft + (event.deltaY > 0 ? 50 : -50)))
    if (max <= 0 || next === input.el.scrollLeft) return
    input.el.scrollLeft = next
    event.preventDefault()
  }
  input.el.addEventListener("wheel", onWheel, { passive: false })
  const observer = new ResizeObserver(schedule)
  observer.observe(input.el)
  const mutations = new MutationObserver(schedule)
  mutations.observe(input.el, { childList: true })
  schedule()
  return {
    schedule,
    dispose() {
      input.el.removeEventListener("wheel", onWheel)
      observer.disconnect()
      mutations.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    },
  }
}
