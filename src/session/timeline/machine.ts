export const BOTTOM_THRESHOLD = 10

export type TimelinePosition = { readonly top: number; readonly max: number }

export function isAwayFromEnd(position: TimelinePosition) {
  return position.max - position.top >= BOTTOM_THRESHOLD
}

// The public auto-scroll hook owns the pause. Decide which scroll events it should receive.
export function timelineScrollAction(input: {
  previous: TimelinePosition
  current: TimelinePosition
  readerInteracted: boolean
  paused: boolean
}): "pin" | "forward" | "hold" {
  const { previous, current, readerInteracted, paused } = input
  const away = isAwayFromEnd(current)

  // Layout can clamp the offset and grow the range again before delivering its scroll event.
  if (!paused) return away && !readerInteracted ? "pin" : "forward"

  // A delayed event resting near the end must preserve an upward key or text selection.
  const arrived = current.top > previous.top + 0.5 || current.max < previous.max
  return current.max <= 1 || away || arrived ? "forward" : "hold"
}
