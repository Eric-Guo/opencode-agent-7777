import { Window } from "happy-dom"

// Install only the DOM globals needed by editor tests, and restore them for headless suites.
export function installDOM() {
  const browser = new Window()
  const globals = ["window", "document", "Node", "NodeFilter", "HTMLElement", "InputEvent"] as const
  const previous = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  for (const name of globals) {
    Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? browser : browser[name] })
  }
  return () => {
    browser.close()
    globals.forEach((name, index) => {
      const descriptor = previous[index]
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
}
