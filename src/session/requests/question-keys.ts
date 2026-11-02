export type QuestionKeyZone = "input" | "options" | "other"

export type QuestionKeyIntent =
  | { type: "dismiss" | "advance" | "commit" | "close-custom" }
  | { type: "move"; step: 1 | -1 }
  | { type: "edge"; to: "first" | "last" }

type Key = Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "defaultPrevented">

// Preserve compact shortcuts: horizontal arrows move between answers, and native
// buttons own Enter/Space. Custom-input Escape closes editing before dock dismissal.
export function questionKey(
  event: Key,
  context: { zone: QuestionKeyZone; editing: boolean },
): QuestionKeyIntent | undefined {
  if (event.defaultPrevented) return
  const mod = (event.metaKey || event.ctrlKey) && !event.altKey

  if (context.zone === "input") {
    if (event.key === "Escape") return { type: "close-custom" }
    if (!mod && event.key === "Enter" && !event.shiftKey) return { type: "commit" }
  }

  if (event.key === "Escape") return { type: "dismiss" }
  if (mod && event.key === "Enter") return event.repeat ? undefined : { type: "advance" }
  if (context.editing || context.zone !== "options" || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.key === "ArrowDown" || event.key === "ArrowRight") return { type: "move", step: 1 }
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") return { type: "move", step: -1 }
  if (event.key === "Home") return { type: "edge", to: "first" }
  if (event.key === "End") return { type: "edge", to: "last" }
}
