import type { ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"
import { TimeoutError } from "@cybros/agent"
import { CONVERSATION_EXPORT_END, conversationExportFilename } from "../src/nexus/chat"
import { BridgeError, type Backend } from "./nexus"

async function* jsonRecords(chunks: AsyncIterable<Uint8Array>, id: string) {
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let pending = ""
  let started = false
  let ended = false

  for await (const chunk of chunks) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split("\n")
    pending = lines.pop()!
    for (const line of lines) {
      const record = JSON.parse(line)
      if (record?.conversation_public_id !== id || typeof record.type !== "string" || ended) {
        throw new Error("Invalid Nexus export record.")
      }
      if (!started && record.type !== "export") throw new Error("Missing opening Nexus export record.")
      if (started && record.type === "export") throw new Error("Repeated opening Nexus export record.")
      // Keep the original JSON tokens, including numbers beyond JavaScript's integer precision.
      yield (started ? ",\n" : "[\n") + "  " + line
      started = true
      ended = record.type === "end"
    }
  }

  // Emit the closing bracket only after both the Nexus end record and gzip trailer arrive.
  if (pending + decoder.decode() || !ended) throw new Error("Incomplete Nexus export.")
  yield CONVERSATION_EXPORT_END
}

export async function exportConversation(
  chat: ReturnType<Backend["workspace"]["conversation"]>,
  id: string,
  res: ServerResponse,
) {
  if (res.destroyed) return
  const controller = new AbortController()
  const cancel = () => {
    if (!res.writableFinished) controller.abort()
  }
  res.once("close", cancel)
  try {
    const file = await chat.export({ signal: controller.signal, timeoutMs: 60_000 }).catch((error) => {
      if (error instanceof TimeoutError) throw new BridgeError(504, "Nexus export timed out.")
      throw error
    })
    if (res.destroyed || file.status !== 200 || file.contentType !== "application/gzip" || !file.body) {
      await file.body?.cancel()
      if (res.destroyed) return
      throw new BridgeError(502, "Nexus did not return a conversation export.")
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${conversationExportFilename(id)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    await pipeline(
      Readable.from(file.body as AsyncIterable<Uint8Array>, { objectMode: false }),
      createGunzip(),
      (source) => jsonRecords(source, id),
      res,
      { signal: controller.signal },
    )
  } finally {
    res.off("close", cancel)
  }
}
