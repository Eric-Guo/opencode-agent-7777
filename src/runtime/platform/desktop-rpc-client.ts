import { Context, Effect, Layer, ManagedRuntime, Queue, Schema, Stream } from "effect"
import { Rpc, RpcClient, RpcClientError, RpcGroup, RpcMessage } from "effect/rpc"
import {
  ClipboardImage,
  CybrosCurrentUser,
  FilePickerOptions,
  PickedFiles,
  ServerReadyData,
  type DesktopAPI,
} from "./desktop-api"

const AppAwaitInitialization = Rpc.make("AppAwaitInitialization", { success: ServerReadyData })
const AppGetCybrosCurrentUser = Rpc.make("AppGetCybrosCurrentUser", {
  success: Schema.NullOr(CybrosCurrentUser),
})
const AppSetBackgroundColor = Rpc.make("AppSetBackgroundColor", { payload: { color: Schema.String } })
const FilesOpenFilePicker = Rpc.make("FilesOpenFilePicker", {
  payload: { options: Schema.optionalKey(FilePickerOptions) },
  success: Schema.NullOr(PickedFiles),
})
const FilesReadPickedFile = Rpc.make("FilesReadPickedFile", {
  payload: { token: Schema.String, path: Schema.String },
  success: Schema.Uint8Array,
})
const FilesReleasePickedFiles = Rpc.make("FilesReleasePickedFiles", { payload: { token: Schema.String } })
const FilesReadClipboardImage = Rpc.make("FilesReadClipboardImage", { success: Schema.NullOr(ClipboardImage) })
const FilesOpenPath = Rpc.make("FilesOpenPath", {
  payload: { path: Schema.String, application: Schema.optional(Schema.String) },
  success: Schema.NullOr(Schema.String),
})
const FilesRevealPath = Rpc.make("FilesRevealPath", { payload: { path: Schema.String }, success: Schema.Boolean })
const AppCheckAppExists = Rpc.make("AppCheckAppExists", {
  payload: { appName: Schema.String },
  success: Schema.Boolean,
})
const DesktopRpcs = RpcGroup.make(
  FilesOpenPath,
  FilesRevealPath,
  AppCheckAppExists,
  AppAwaitInitialization,
  AppGetCybrosCurrentUser,
  AppSetBackgroundColor,
  FilesOpenFilePicker,
  FilesReadPickedFile,
  FilesReleasePickedFiles,
  FilesReadClipboardImage,
)

type DesktopRpcClient = RpcClient.FromGroup<typeof DesktopRpcs, RpcClientError.RpcClientError>
type InvokeTag = keyof DesktopRpcClient
type InvokeArgs<Tag extends InvokeTag> = Parameters<DesktopRpcClient[Tag]>
type InvokeResult<Tag extends InvokeTag> =
  ReturnType<DesktopRpcClient[Tag]> extends Effect.Effect<infer Value, unknown> ? Value : never

class DesktopClient extends Context.Service<DesktopClient, DesktopRpcClient>()("opencode/7777/DesktopClient") {}

const toArrayBuffer = (value: Uint8Array) =>
  value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer

export function createDesktopApi(port: Promise<MessagePort>): DesktopAPI {
  const ClientProtocolLive = Layer.unwrap(Effect.promise(() => port).pipe(Effect.map(clientProtocol)))
  const ClientLive = Layer.effect(DesktopClient, RpcClient.make(DesktopRpcs)).pipe(Layer.provide(ClientProtocolLive))
  const runtime = ManagedRuntime.make(ClientLive)
  const invoke = <Tag extends InvokeTag>(tag: Tag, ...payload: InvokeArgs<Tag>): Promise<InvokeResult<Tag>> =>
    runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* DesktopClient
        const method = client[tag] as unknown as (...args: ReadonlyArray<unknown>) => Effect.Effect<unknown, unknown>
        return yield* method(...payload)
      }),
    ) as Promise<InvokeResult<Tag>>

  window.addEventListener("pagehide", () => void runtime.dispose(), { once: true })
  return {
    openPath: (path, application) => invoke("FilesOpenPath", { path, application }).then((error) => error ?? undefined),
    revealPath: (path) => invoke("FilesRevealPath", { path }),
    checkAppExists: (appName) => invoke("AppCheckAppExists", { appName }),
    awaitInitialization: () => invoke("AppAwaitInitialization"),
    getCybrosCurrentUser: () => invoke("AppGetCybrosCurrentUser"),
    openFilePicker: (options) => invoke("FilesOpenFilePicker", options ? { options } : {}),
    readPickedFile: (token, path) => invoke("FilesReadPickedFile", { token, path }).then(toArrayBuffer),
    releasePickedFiles: (token) => invoke("FilesReleasePickedFiles", { token }),
    getPathForFile: (file) => window.electron.getPathForFile(file),
    readClipboardImage: () =>
      invoke("FilesReadClipboardImage").then((image) =>
        image ? { ...image, buffer: toArrayBuffer(image.buffer) } : null,
      ),
    setBackgroundColor: (color) => invoke("AppSetBackgroundColor", { color }),
  }
}

// Match the desktop host's structured-clone protocol. MessagePack bytes are not RPC
// envelopes to that host and leave initialization waiting without a response.
function clientProtocol(value: MessagePort) {
  return Layer.effect(
    RpcClient.Protocol,
    RpcClient.Protocol.make(
      Effect.fnUntraced(function* (writeResponse, clientIds) {
        const inbound = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
        const onMessage = (event: MessageEvent) => {
          Queue.offerUnsafe(inbound, event.data as RpcMessage.FromServerEncoded)
        }
        value.addEventListener("message", onMessage)
        value.start()
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            value.removeEventListener("message", onMessage)
            value.close()
          }),
        )
        yield* Stream.fromQueue(inbound).pipe(
          Stream.runForEach((message) =>
            Effect.forEach(clientIds, (clientId) => writeResponse(clientId, message), { discard: true }),
          ),
          Effect.forkScoped,
        )
        return {
          codecFor: Schema.toCodecJson,
          send: (_clientId, request) =>
            Effect.sync(() => {
              value.postMessage(request)
            }),
          supportsAck: true,
          supportsTransferables: false,
        }
      }),
    ),
  )
}
