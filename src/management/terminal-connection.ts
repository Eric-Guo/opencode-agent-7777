import { Schema } from "effect"
import type { TaskRealtime } from "@cybros/agent"
import { TerminalStream } from "./terminal-stream"

type Call = <T>(action: "realtime" | "answer", input?: { connection_id: string; sdp: string }) => Promise<T>

export function terminalConnection(options: {
  call: Call
  signal: AbortSignal
  iceServers?: RTCIceServer[]
  output(data: Uint8Array): Promise<void>
  status(value: string): void
}) {
  const stream = new TerminalStream()
  let peer: RTCPeerConnection | undefined
  let data: RTCDataChannel | undefined
  let permission: RTCDataChannel | undefined
  let connectionID: string | null = null
  let expires = 0
  let sequence = 0
  let probe: { nonce: number; started: number } | undefined
  let pending: { id: number; bytes: number; started: number; sequence?: number } | undefined
  let buffered = ""
  let bufferedUntil = 0
  let flushing = false
  let rendering = false
  let attaching = false
  let polling = false
  let closed = false
  let size = { cols: 80, rows: 24 }
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const allowed = () => !closed && !options.signal.aborted && performance.now() < expires

  const schedule = (fn: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, delay)

    timers.add(timer)
  }

  const pause = () => {
    expires = 0

    if (pending) options.status("Input delivery is uncertain. Reconnect without resending it.")
    pending = undefined
    buffered = ""
  }

  const detach = () => {
    pause()
    peer?.close()
    peer = undefined
    data = undefined
    permission = undefined
    probe = undefined
  }

  const resume = () => {
    if (rendering || !allowed() || data?.readyState !== "open" || data.bufferedAmount > 16384) return
    data.send(stream.resume())
    data.send(JSON.stringify({ type: "resize", ...size }))
  }

  const close = () => {
    closed = true
    timers.forEach(clearTimeout)
    timers.clear()
    detach()
  }

  options.signal.addEventListener("abort", close, { once: true })

  async function attach(projection: TaskRealtime) {
    detach()
    const current = (peer = new RTCPeerConnection({ iceServers: options.iceServers ?? [] }))
    connectionID = projection.connection_id
    const terminal = (data = current.createDataChannel("terminal", { negotiated: true, id: 0, ordered: true }))
    terminal.binaryType = "arraybuffer"
    terminal.onmessage = async (message) => {
      if (peer !== current || !allowed()) return

      try {
        const frame = stream.receive(
          message.data instanceof ArrayBuffer
            ? new TextDecoder("utf-8", { fatal: true }).decode(message.data)
            : message.data,
          !rendering,
        )

        if (frame.receipt) {
          const receipt = frame.receipt

          if (!pending || receipt.id !== pending.id) return

          if (
            receipt.bytes > pending.bytes ||
            (receipt.status === "received" && receipt.bytes !== pending.bytes) ||
            (pending.sequence && receipt.sequence !== pending.sequence)
          )
            throw new Error("Mismatched input receipt.")
          pending.sequence = receipt.sequence

          if (receipt.status === "written") {
            pending = undefined
            flushSoon()
          }

          return
        }

        if (rendering) return
        rendering = true

        if (frame.gap) options.status(`${frame.gap} bytes of older output are no longer available.`)

        if (frame.data?.length) await options.output(frame.data)
        rendering = false
        resume()
      } catch (error) {
        rendering = false

        if (peer === current) {
          detach()
          options.status(error instanceof Error ? error.message : String(error))
        }
      }
    }

    const grants = (permission = current.createDataChannel("permission", { negotiated: true, id: 1, ordered: true }))
    grants.onmessage = (message) => {
      if (peer !== current || typeof message.data !== "string" || message.data.length > 128) return

      const decoded = Schema.decodeUnknownOption(
        Schema.fromJsonString(
          Schema.Struct({
            nonce: Schema.Int,
            max_age_ms: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
          }),
        ),
      )(message.data)

      if (decoded._tag === "None" || decoded.value.nonce !== probe?.nonce) return
      expires = decoded.value.max_age_ms ? probe.started + decoded.value.max_age_ms : 0
      probe = undefined
      options.status(allowed() ? "Connected" : "Permission paused")
      resume()
    }

    grants.onclose = grants.onerror = () => {
      if (peer === current) pause()
    }

    current.onconnectionstatechange = () => {
      if (peer !== current) return

      if (["failed", "closed"].includes(current.connectionState)) detach()

      if (current.connectionState === "disconnected") pause()
    }

    await current.setRemoteDescription({ type: "offer", sdp: projection.offer_sdp! })
    await current.setLocalDescription(await current.createAnswer())

    if (current.iceGatheringState !== "complete")
      await new Promise<void>((resolve, reject) => {
        const abort = () => done(new Error("Terminal detached."))

        const changed = () => {
          if (current.iceGatheringState === "complete") done()
        }

        const timer = setTimeout(() => done(new Error("Terminal ICE negotiation timed out.")), 10000)

        const done = (error?: Error) => {
          clearTimeout(timer)
          current.removeEventListener("icegatheringstatechange", changed)
          options.signal.removeEventListener("abort", abort)

          if (error) reject(error)
          else resolve()
        }

        current.addEventListener("icegatheringstatechange", changed)
        options.signal.addEventListener("abort", abort, { once: true })

        if (options.signal.aborted) abort()
      })

    if (peer !== current || closed) return
    await options.call("answer", { connection_id: connectionID!, sdp: current.localDescription!.sdp })
  }

  async function tick() {
    if (closed || options.signal.aborted) return
    const ready = permission?.readyState === "open" && peer?.connectionState === "connected"

    if (ready) {
      if ((!probe || performance.now() - probe.started >= 500) && permission!.bufferedAmount < 1024) {
        probe = { nonce: ++sequence, started: performance.now() }
        permission!.send(JSON.stringify(probe.nonce))
      }

      if (!allowed()) pause()

      if (pending && performance.now() - pending.started > 5000) detach()
    }

    if (!ready && !polling && !attaching) {
      polling = true

      try {
        const projection = await options.call<TaskRealtime>("realtime")

        if (closed || options.signal.aborted) return

        if (projection.status === "closed") {
          close()
          options.status("Terminal closed")

          return
        }

        if (peer && projection.connection_id !== connectionID) detach()

        if (projection.offer_sdp && projection.connection_id !== connectionID && !projection.answer_sdp) {
          attaching = true
          await attach(projection)
        }
      } catch (error) {
        detach()
        options.status(error instanceof Error ? error.message : String(error))
      } finally {
        polling = false
        attaching = false
      }
    }

    schedule(() => void tick(), 250)
  }

  options.status("Connecting")
  void tick()

  function flushSoon() {
    if (flushing || pending || !buffered) return
    flushing = true
    schedule(() => {
      flushing = false
      const text = buffered
      buffered = ""

      if (!text) return

      if (
        !allowed() ||
        performance.now() >= bufferedUntil ||
        data?.readyState !== "open" ||
        peer?.connectionState !== "connected"
      ) {
        options.status("Input was not sent because permission or the connection expired.")

        return
      }

      const frame = stream.input(text)
      pending = { id: frame.id, bytes: frame.bytes, started: performance.now() }

      try {
        data.send(stream.resume())
        data.send(frame.frame)
      } catch {
        detach()
      }
    }, 16)
  }

  return {
    resize(cols: number, rows: number) {
      size = { cols: Math.max(2, Math.min(500, cols)), rows: Math.max(2, Math.min(200, rows)) }
      resume()
    },
    send(text: string) {
      if (
        !allowed() ||
        data?.readyState !== "open" ||
        data.bufferedAmount > 16384 ||
        peer?.connectionState !== "connected"
      )
        return false

      if (new TextEncoder().encode(buffered + text).length > 8192) return false

      if (!buffered) bufferedUntil = expires
      buffered += text
      flushSoon()

      return true
    },
    close() {
      options.signal.removeEventListener("abort", close)
      close()
    },
  }
}
