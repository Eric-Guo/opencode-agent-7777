import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { RpcMessage } from "effect/rpc"
import { createDesktopApi } from "./desktop-rpc-client"
import { resolveServer } from "@/runtime/server/resolver-compact"

describe("desktop message-port transport", () => {
  test("initializes against the desktop host's structured-clone protocol", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window")
    const events = new EventTarget()
    Object.defineProperty(globalThis, "window", { configurable: true, value: events })
    const { port1: host, port2: renderer } = new MessageChannel()
    const received = Promise.withResolvers<unknown>()
    host.addEventListener("message", (event) => received.resolve(event.data), { once: true })
    host.start()

    try {
      const api = createDesktopApi(Promise.resolve(renderer))
      Object.assign(events, { api })
      const initialized = api.awaitInitialization!()
      // Disposing the runtime also rejects pending calls if a transport assertion fails.
      void initialized.catch(() => undefined)
      const request = (await received.promise) as RpcMessage.RequestEncoded
      expect(request).toMatchObject({ _tag: "Request", tag: "AppAwaitInitialization" })

      const data = {
        url: "http://localhost:4096",
        localAgent: "support",
        welcomeText: "Welcome",
        storageKeys: {
          sessionID: "support.session",
          sessionDirectory: "support.directory",
          promptDraft: "support.draft",
        },
      }
      // Deliver on a later task, as Electron's main process does, after the client subscribes.
      setTimeout(() => {
        host.postMessage({
          _tag: "Exit",
          requestId: request.id,
          exit: { _tag: "Success", value: data },
        } satisfies RpcMessage.ResponseExitEncoded)
      }, 0)
      expect(await initialized).toEqual(data)

      const requests: RpcMessage.RequestEncoded[] = []
      const image = { buffer: new Uint8Array([0, 128, 255]), width: 1, height: 1 }
      const files = { token: "picked-files", files: [{ path: "/project/notes.txt", name: "notes.txt", size: 3 }] }
      const bytes = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4)
      let cancelled = false
      let openError: string | null = null
      host.addEventListener("message", (event) => {
        const request = event.data as RpcMessage.RequestEncoded
        if (request._tag !== "Request") return
        requests.push(request)
        const value =
          request.tag === "AppAwaitInitialization"
            ? data
            : request.tag === "FilesOpenPath"
              ? openError
              : request.tag === "FilesReadClipboardImage"
                ? { ...image, buffer: Schema.encodeSync(Schema.toCodecJson(Schema.Uint8Array))(image.buffer) }
                : request.tag === "FilesOpenFilePicker"
                  ? cancelled
                    ? null
                    : files
                  : request.tag === "FilesReadPickedFile"
                    ? Schema.encodeSync(Schema.toCodecJson(Schema.Uint8Array))(bytes)
                    : null
        host.postMessage({
          _tag: "Exit",
          requestId: request.id,
          exit: { _tag: "Success", value },
        } satisfies RpcMessage.ResponseExitEncoded)
      })
      expect((await resolveServer()).storageKeys).toEqual(data.storageKeys)
      const [user, background, clipboard] = await Promise.all([
        api.getCybrosCurrentUser!(),
        api.setBackgroundColor!("#ffffff"),
        api.readClipboardImage!(),
      ])
      expect(user).toBeNull()
      expect(background).toBeUndefined()
      expect(clipboard && { ...clipboard, buffer: new Uint8Array(clipboard.buffer) }).toEqual(image)
      expect(requests.map(({ tag, payload }) => ({ tag, payload }))).toEqual([
        { tag: "AppAwaitInitialization", payload: null },
        { tag: "AppGetCybrosCurrentUser", payload: null },
        { tag: "AppSetBackgroundColor", payload: { color: "#ffffff" } },
        { tag: "FilesReadClipboardImage", payload: null },
      ])

      const picked = await api.openFilePicker!({ multiple: true, defaultPath: "/project", extensions: ["txt"] })
      expect(picked).toEqual(files)
      const file = await api.readPickedFile!(picked!.token, picked!.files[0].path)
      expect(file).toBeInstanceOf(ArrayBuffer)
      expect(new Uint8Array(file)).toEqual(new Uint8Array([1, 2, 3]))
      expect(await api.releasePickedFiles!(picked!.token)).toBeUndefined()
      cancelled = true
      expect(await api.openFilePicker!()).toBeNull()
      expect(requests.slice(4).map(({ tag, payload }) => ({ tag, payload }))).toEqual([
        {
          tag: "FilesOpenFilePicker",
          payload: { options: { multiple: true, defaultPath: "/project", extensions: ["txt"] } },
        },
        { tag: "FilesReadPickedFile", payload: { token: "picked-files", path: "/project/notes.txt" } },
        { tag: "FilesReleasePickedFiles", payload: { token: "picked-files" } },
        { tag: "FilesOpenFilePicker", payload: {} },
      ])

      const path = "C:/workspace/上海天华撤销生产部门明细.xlsx"
      expect(await api.openPath!(path)).toBeUndefined()
      openError = "No application is associated with this file"
      expect(await api.openPath!(path)).toBe(openError)
      expect(requests.slice(-2).map(({ tag, payload }) => ({ tag, payload }))).toEqual([
        { tag: "FilesOpenPath", payload: { path } },
        { tag: "FilesOpenPath", payload: { path } },
      ])
    } finally {
      events.dispatchEvent(new Event("pagehide"))
      host.close()
      renderer.close()
      if (original) Object.defineProperty(globalThis, "window", original)
      else delete (globalThis as { window?: typeof globalThis.window }).window
    }
  })
})
