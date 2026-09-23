import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { RpcMessage } from "effect/unstable/rpc"
import { createDesktopApi, ServerReadyData } from "./desktop-rpc-client"
import { resolveServer } from "@/runtime/server/resolver-compact"

const decode = Schema.decodeUnknownSync(ServerReadyData)

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
      host.addEventListener("message", (event) => {
        const request = event.data as RpcMessage.RequestEncoded
        if (request._tag !== "Request") return
        requests.push(request)
        const value =
          request.tag === "AppAwaitInitialization"
            ? data
            : request.tag === "FilesReadClipboardImage"
              ? { ...image, buffer: Schema.encodeSync(Schema.toCodecJson(Schema.Uint8Array))(image.buffer) }
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
    } finally {
      events.dispatchEvent(new Event("pagehide"))
      host.close()
      renderer.close()
      if (original) Object.defineProperty(globalThis, "window", original)
      else delete (globalThis as { window?: typeof globalThis.window }).window
    }
  })
})

describe("desktop initialization response", () => {
  test.each([
    null,
    {},
    { sessionID: "id", sessionDirectory: "directory", promptDraft: "" },
    { sessionID: 5, sessionDirectory: "directory", promptDraft: "draft" },
  ])("rejects malformed storage keys: %j", (storageKeys) => {
    expect(() => decode({ url: "http://localhost:4096", storageKeys })).toThrow()
  })
  test("accepts current desktop data without a password and preserves tab configuration", () => {
    expect(
      decode({
        url: "http://localhost:4096",
        localAgent: "support",
        welcomeText: "Welcome",
        suggestedQuestions: ["Help"],
        ssoJwtSecretKey: "test-key",
      }),
    ).toEqual({
      url: "http://localhost:4096",
      localAgent: "support",
      welcomeText: "Welcome",
      suggestedQuestions: ["Help"],
      ssoJwtSecretKey: "test-key",
    })
  })

  test.each([null, "", "legacy-password"])("preserves legacy password %p", (password) => {
    expect(decode({ url: "http://localhost:4096", password })).toEqual({
      url: "http://localhost:4096",
      password,
    })
  })

  test("still rejects missing URLs and malformed credentials", () => {
    expect(() => decode({})).toThrow()
    expect(() => decode({ url: "http://localhost:4096", password: 123 })).toThrow()
  })
})
