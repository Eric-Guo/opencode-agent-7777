import { Context, Effect, Layer, ManagedRuntime, Queue, Schema, Stream } from "effect"
import { Rpc, RpcClient, RpcClientError, RpcGroup, RpcMessage, RpcSerialization } from "effect/unstable/rpc"

const ServerReadyData = Schema.Struct({
  url: Schema.String,
  username: Schema.NullOr(Schema.String),
  password: Schema.NullOr(Schema.String),
  ssoJwtSecretKey: Schema.optionalKey(Schema.String),
  localAgent: Schema.optionalKey(Schema.String),
  welcomeText: Schema.optionalKey(Schema.String),
  suggestedQuestions: Schema.optionalKey(Schema.Array(Schema.String)),
})
const CybrosCurrentUser = Schema.Struct({ chinese_name: Schema.String, clerk_code: Schema.String })
const FilePickerOptions = Schema.Struct({
  multiple: Schema.optionalKey(Schema.Boolean),
  title: Schema.optionalKey(Schema.String),
  defaultPath: Schema.optionalKey(Schema.String),
  extensions: Schema.optionalKey(Schema.Array(Schema.String)),
})
const PickedFiles = Schema.Struct({
  token: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String, name: Schema.String, size: Schema.Number })),
})
const ClipboardImage = Schema.Struct({ buffer: Schema.Uint8Array, width: Schema.Number, height: Schema.Number })
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
const DesktopRpcs = RpcGroup.make(
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
type Mutable<Value> =
  Value extends ReadonlyArray<unknown>
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value extends object
      ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
      : Value

class DesktopClient extends Context.Service<DesktopClient, DesktopRpcClient>()("opencode/7777/DesktopClient") {}

const mutable = <Value>(value: Value) => value as Mutable<Value>
const toArrayBuffer = (value: Uint8Array) =>
  value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer

export function createDesktopApi(port: Promise<MessagePort>): NonNullable<Window["api"]> {
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
    awaitInitialization: () => invoke("AppAwaitInitialization").then(mutable),
    getCybrosCurrentUser: () => invoke("AppGetCybrosCurrentUser").then(mutable),
    openFilePicker: (options) => invoke("FilesOpenFilePicker", { options }).then(mutable),
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

function clientProtocol(value: MessagePort) {
  return Layer.effect(
    RpcClient.Protocol,
    RpcClient.Protocol.make(
      Effect.fnUntraced(function* (writeResponse, clientIds) {
        const serialization = yield* RpcSerialization.RpcSerialization
        const parser = serialization.makeUnsafe()
        const inbound = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
        const onMessage = (event: MessageEvent) => {
          try {
            parser
              .decode(event.data)
              .forEach((message) => Queue.offerUnsafe(inbound, message as RpcMessage.FromServerEncoded))
          } catch {
            return
          }
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
          send: (_clientId, request) =>
            Effect.sync(() => {
              const encoded = parser.encode(request)
              if (encoded !== undefined) value.postMessage(encoded)
            }),
          supportsAck: true,
          supportsTransferables: false,
          codecFor: serialization.codecFor,
        }
      }),
    ),
  ).pipe(Layer.provide(RpcSerialization.layerMsgPack))
}
