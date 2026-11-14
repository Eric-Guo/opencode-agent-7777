import { afterAll, afterEach, beforeAll, beforeEach, expect, jest, spyOn, test } from "bun:test"
import { OpenCode, type SessionInfo } from "@opencode/client/promise"
import { createRoot } from "solid-js"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { setSessionClient, setState } from "@/runtime/server/session-store-compact"
import * as transfer from "./export"
import { EXPORT_TIMEOUT_MS } from "./export-machine"
import { installDOM } from "@/test/dom"
import type { Locale, useLanguage } from "@/runtime/i18n/language"

browserSuite(import.meta.path, () => {
  const cleanupDOM = installDOM()
  afterAll(cleanupDOM)
  let toast: typeof import("@opencode/ui/toast")
  let createSessionExporter: (typeof import("./export-session"))["createSessionExporter"]
  beforeAll(async () => {
    toast = await import("@opencode/ui/toast")
    createSessionExporter = (await import("./export-session")).createSessionExporter
  })
  const info: SessionInfo = {
    id: "ses_export",
    title: "Original session",
    agent: "7777",
    projectID: "project",
    location: { directory: "/repo" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 2 },
  }
  const data: transfer.SessionExportData = { info, messages: [] }
  let language: Pick<ReturnType<typeof useLanguage>, "t" | "setLocale">
  let dispose: VoidFunction
  let exporter: ReturnType<typeof createSessionExporter>
  let download: ReturnType<typeof spyOn<typeof transfer, "downloadSessionExport">>
  let notify: ReturnType<typeof spyOn<typeof toast, "showToast">>
  let dismiss: ReturnType<typeof spyOn<typeof toast.toaster, "dismiss">>
  let calls: { request: Request; response: ReturnType<typeof Promise.withResolvers<Response>> }[]

  beforeEach(() => {
    calls = []
    download = spyOn(transfer, "downloadSessionExport").mockImplementation(() => {})
    notify = spyOn(toast, "showToast").mockImplementation(() => 42)
    dismiss = spyOn(toast.toaster, "dismiss").mockImplementation(() => 42)
    setState({ session: structuredClone(info), error: "" })
    setSessionClient(
      OpenCode.make({
        baseUrl: "http://fixture.local",
        fetch: (async (input, init) => {
          const response = Promise.withResolvers<Response>()
          calls.push({ request: new Request(input, init), response })
          return response.promise
        }) as typeof fetch,
      }),
    )
    exporter = createRoot((cleanup) => {
      dispose = cleanup
      let locale: Locale = "zh"
      language = {
        t: (key) => `${locale}:${key}`,
        setLocale: (next) => {
          locale = next
        },
      }
      exporter = createSessionExporter(language)
      return exporter
    })
  })
  afterEach(() => {
    dispose()
    setSessionClient(undefined)
    setState({ session: undefined, error: "" })
    jest.useRealTimers()
    download.mockRestore()
    notify.mockRestore()
    dismiss.mockRestore()
  })

  test("notifications use the supplied language instead of browser preference storage", async () => {
    const pending = exporter.export()
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ title: "zh:toast.session.export.loading" })
    language.setLocale("en")
    calls[0].response.resolve(Response.json({ data }))
    await pending
    expect(notify.mock.calls.at(-1)?.[0]).toMatchObject({ title: "en:toast.session.export.success.title" })
  })

  test("disposal during the loading notification cleans up without starting a read", async () => {
    jest.useFakeTimers()
    notify.mockImplementationOnce(() => {
      dispose()
      return 42
    })
    const pending = exporter.export()
    expect(calls).toHaveLength(0)
    expect(exporter.exporting()).toBe(false)
    expect(dismiss).toHaveBeenCalledWith(42)
    await pending
    jest.advanceTimersByTime(EXPORT_TIMEOUT_MS)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  test("disposal while dismissing loading suppresses the completion notification", async () => {
    dismiss.mockImplementationOnce(() => {
      dispose()
      return 42
    })
    const pending = exporter.export()
    calls[0].response.resolve(Response.json({ data }))
    await pending
    expect(download).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls.map(([value]) => (typeof value === "string" ? undefined : value.variant))).toEqual([
      "loading",
    ])
  })

  test("serializes exports and downloads the captured session after navigation", async () => {
    const pending = exporter.export()
    await exporter.export()
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0].request.url).pathname).toBe("/api/experimental/session/ses_export/export")
    setState("session", { ...info, id: "other" })
    calls[0].response.resolve(Response.json({ data }))
    await pending
    expect(download).toHaveBeenCalledWith("original-session.json", data)
    expect(exporter.exporting()).toBe(false)
    expect(dismiss).toHaveBeenCalledWith(42)
    expect(notify.mock.calls.map(([value]) => (typeof value === "string" ? undefined : value.variant))).toEqual([
      "loading",
      "success",
    ])
  })

  test("the deadline covers response decoding and permits a retry", async () => {
    jest.useFakeTimers()
    const pending = exporter.export()
    let cancelled = false
    calls[0].response.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
      ),
    )
    for (let i = 0; i < 20; i++) await Promise.resolve()
    jest.advanceTimersByTime(EXPORT_TIMEOUT_MS)
    await pending
    expect(calls[0].request.signal.aborted).toBe(true)
    expect(exporter.exporting()).toBe(false)
    expect(download).not.toHaveBeenCalled()
    expect(notify.mock.calls.map(([value]) => (typeof value === "string" ? undefined : value.variant))).toEqual([
      "loading",
      "error",
    ])
    jest.useRealTimers()
    const retry = exporter.export()
    expect(cancelled).toBe(true)
    await Bun.sleep(0)
    expect(exporter.exporting()).toBe(true)
    expect(download).not.toHaveBeenCalled()
    expect(dismiss).toHaveBeenCalledTimes(1)
    calls[1].response.resolve(Response.json({ data }))
    await retry
    expect(download).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalledTimes(2)
  })

  test("disposal silently settles the caller and prevents late downloads and future requests", async () => {
    const pending = exporter.export()
    dispose()
    await pending
    expect(calls[0].request.signal.aborted).toBe(true)
    expect(exporter.exporting()).toBe(false)
    calls[0].response.resolve(Response.json({ data }))
    await Bun.sleep(0)
    expect(download).not.toHaveBeenCalled()
    expect(notify.mock.calls.map(([value]) => (typeof value === "string" ? undefined : value.variant))).toEqual([
      "loading",
    ])
    expect(dismiss).toHaveBeenCalledTimes(1)
    await exporter.export()
    expect(calls).toHaveLength(1)
  })

  test.each([false, true])(
    "fetch/download failure cleans up and allows another export (download: %s)",
    async (save) => {
      if (save)
        download.mockImplementationOnce(() => {
          throw new Error("Download failed")
        })
      const pending = exporter.export()
      calls[0].response.resolve(save ? Response.json({ data }) : new Response("Unavailable", { status: 503 }))
      await pending
      expect(exporter.exporting()).toBe(false)
      expect(notify.mock.calls.map(([value]) => (typeof value === "string" ? undefined : value.variant))).toEqual([
        "loading",
        "error",
      ])
      expect(dismiss).toHaveBeenCalledTimes(1)
      const retry = exporter.export()
      calls[1].response.resolve(Response.json({ data }))
      await retry
      expect(notify.mock.calls.map(([value]) => (typeof value === "string" ? undefined : value.variant)).at(-1)).toBe(
        "success",
      )
    },
  )
})
