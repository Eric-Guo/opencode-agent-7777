import { Schema } from "effect"

export function terminalEnded(status: string) {
  return ["completed", "failed", "timed_out", "uncertain", "canceled", "cancelled", "skipped", "stopped"].includes(
    status,
  )
}

const Offset = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))

const Frame = Schema.Union([
  Schema.Struct({ type: Schema.Literal("output"), offset: Offset, data: Schema.String }),
  Schema.Struct({ type: Schema.Literal("gap"), from: Offset, to: Offset }),
  Schema.Struct({
    type: Schema.Literal("receipt"),
    id: Offset,
    sequence: Offset,
    bytes: Offset,
    status: Schema.Literals(["received", "written"]),
  }),
])

/** Byte cursors survive peer replacement; inputs are never automatically replayed. */
export class TerminalStream {
  offset = 0
  inputID = 0
  resume() {
    return JSON.stringify({ type: "resume", offset: this.offset })
  }
  input(text: string) {
    const bytes = new TextEncoder().encode(text)

    if (!bytes.length || bytes.length > 8192) throw new Error("Terminal input must contain 1–8192 bytes.")

    return {
      bytes: bytes.length,
      id: ++this.inputID,
      frame: JSON.stringify({ type: "input", id: this.inputID, data: btoa(String.fromCharCode(...bytes)) }),
    }
  }
  receive(raw: string, consume = true) {
    if (raw.length > 16384) throw new Error("Terminal frame is too large.")
    const frame = Schema.decodeUnknownSync(Schema.fromJsonString(Frame))(raw)

    if (frame.type === "receipt") {
      if (!frame.id || !frame.sequence || frame.bytes > 8192 || (frame.status === "received" && !frame.bytes))
        throw new Error("Invalid terminal input receipt.")

      return { receipt: frame }
    }

    if (!consume) return {}

    if (frame.type === "gap") {
      if (frame.to <= frame.from || frame.from > this.offset) throw new Error("Invalid terminal output gap.")
      const gap = Math.max(0, frame.to - this.offset)
      this.offset = Math.max(this.offset, frame.to)

      return { gap }
    }

    if (frame.offset > this.offset) throw new Error("Invalid terminal output offset.")
    const bytes = Uint8Array.from(atob(frame.data), (char) => char.charCodeAt(0))
    const end = frame.offset + bytes.length

    if (!bytes.length || bytes.length > 8192 || !Number.isSafeInteger(end))
      throw new Error("Invalid terminal output block.")
    const data = bytes.subarray(Math.min(bytes.length, this.offset - frame.offset))
    this.offset = Math.max(this.offset, end)

    return { data }
  }
}
