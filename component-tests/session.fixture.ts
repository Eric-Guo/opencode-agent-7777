import type { Page } from "@playwright/test"

// Exercise the real 7777 entry and editor. The fixture supplies the browser bridge
// protocol so streaming, decisions and recovery are deterministic and cost no model calls.
export async function mockEvents(page: Page) {
  await page.addInitScript(() => {
    class Events extends EventTarget {
      constructor() {
        super()
        window.addEventListener("fixture-refresh", this.refresh)
        window.addEventListener("fixture-frame", this.forward)
        setTimeout(() => this.dispatchEvent(new Event("ready")), 5)
      }
      forward = (e: Event) => this.dispatchEvent(new MessageEvent("frame", { data: (e as CustomEvent).detail }))
      refresh = () => this.dispatchEvent(new Event("refresh"))
      close() {
        window.removeEventListener("fixture-refresh", this.refresh)
        window.removeEventListener("fixture-frame", this.forward)
      }
    }
    Object.defineProperty(window, "EventSource", { value: Events })
  })
}
