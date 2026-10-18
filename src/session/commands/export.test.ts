import { describe, expect, spyOn, test } from "bun:test"
import { OpenCode } from "@opencode/client/promise"
import { installDOM } from "@/test/dom"
import { downloadSessionExport, fetchSessionExport, sessionExportFilename, type SessionExportData } from "./export"

function transcript(): SessionExportData {
  return {
    info: {
      id: "ses_export",
      title: "Export example",
      agent: "7777",
      projectID: "project",
      location: { directory: "/repo" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 2 },
    },
    messages: Array.from({ length: 250 }, (_, index) => ({
      id: `msg_${index}`,
      type: "user",
      text: `Message ${index}`,
      files: [],
      time: { created: index },
    })),
  }
}

describe("session export", () => {
  test("uses the public transfer endpoint and retains the full transcript beyond the visible window", async () => {
    const data = transcript()
    const calls: { method: string; path: string }[] = []
    const api = OpenCode.make({
      baseUrl: "http://fixture.local",
      fetch: (async (input, init) => {
        const request = new Request(input, init)
        calls.push({ method: request.method, path: new URL(request.url).pathname })
        return Response.json({ data })
      }) as typeof fetch,
    })
    const exported = await fetchSessionExport({ sessionID: "ses_export", api })
    expect(exported).toEqual(data)
    expect(exported.messages).toHaveLength(250)
    expect(calls).toEqual([{ method: "GET", path: "/api/experimental/session/ses_export/export" }])
  })

  test("propagates export errors without returning a partial transcript", async () => {
    const error = new Error("Export unavailable")
    await expect(
      fetchSessionExport({
        sessionID: "ses_export",
        api: {
          session: {
            export: async () => {
              throw error
            },
          },
        },
      }),
    ).rejects.toBe(error)
  })

  test.each([
    [{ id: "ses_1", title: "Review: src/path?" }, "review-src-path.json"],
    [{ id: "ses_1", slug: "session-slug" }, "session-slug.json"],
    [{ id: "ses_1", title: "会话" }, "ses_1.json"],
    [{ id: "ses_1", title: "../\\:*?" }, "ses_1.json"],
    [{ id: "ses_1" }, "ses_1.json"],
  ])("creates a safe filename for %j", (session, expected) => {
    expect(sessionExportFilename(session)).toBe(expected)
  })

  test.each([false, true])("cleans up the download link and object URL (click fails: %p)", async (fail) => {
    const cleanup = installDOM()
    const data = transcript()
    let blob!: Blob
    const create = spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob
      return "blob:session-export"
    })
    const revoke = spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const click = spyOn(window.HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true)
      expect(this.download).toBe("export-example.json")
      expect(this.href).toBe("blob:session-export")
      if (fail) throw new Error("Download unavailable")
    })
    try {
      if (fail) expect(() => downloadSessionExport("export-example.json", data)).toThrow("Download unavailable")
      else downloadSessionExport("export-example.json", data)
      expect(click).toHaveBeenCalledTimes(1)
      expect(blob.type.split(";")[0]).toBe("application/json")
      expect(await blob.text()).toBe(JSON.stringify(data, null, 2))
      expect(document.querySelectorAll("a")).toHaveLength(0)
      expect(revoke).toHaveBeenCalledWith("blob:session-export")
    } finally {
      click.mockRestore()
      revoke.mockRestore()
      create.mockRestore()
      cleanup()
    }
  })
})
