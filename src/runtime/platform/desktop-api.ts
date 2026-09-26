import { Schema, Struct } from "effect"

// Package-owned host contracts. Type-only consumers do not load the RPC transport.
export const ServerReadyData = Schema.Struct({
  url: Schema.String,
  // Current desktop hosts omit credentials; older hosts may still send a password or null.
  password: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ssoJwtSecretKey: Schema.optionalKey(Schema.String),
  localAgent: Schema.optionalKey(Schema.String),
  welcomeText: Schema.optionalKey(Schema.String),
  suggestedQuestions: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.String))),
  storageKeys: Schema.optionalKey(
    Schema.Struct({
      sessionID: Schema.NonEmptyString,
      sessionDirectory: Schema.NonEmptyString,
      promptDraft: Schema.NonEmptyString,
    }).mapFields(Struct.map(Schema.mutableKey)),
  ),
}).mapFields(Struct.map(Schema.mutableKey))

export const CybrosCurrentUser = Schema.Struct({ chinese_name: Schema.String, clerk_code: Schema.String }).mapFields(
  Struct.map(Schema.mutableKey),
)
export type CybrosCurrentUser = typeof CybrosCurrentUser.Type

export const FilePickerOptions = Schema.Struct({
  multiple: Schema.optionalKey(Schema.Boolean),
  title: Schema.optionalKey(Schema.String),
  defaultPath: Schema.optionalKey(Schema.String),
  extensions: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.String))),
}).mapFields(Struct.map(Schema.mutableKey))

export const PickedFiles = Schema.Struct({
  token: Schema.String,
  files: Schema.mutable(
    Schema.Array(
      Schema.Struct({ path: Schema.String, name: Schema.String, size: Schema.Number }).mapFields(
        Struct.map(Schema.mutableKey),
      ),
    ),
  ),
}).mapFields(Struct.map(Schema.mutableKey))

export const ClipboardImage = Schema.Struct({
  buffer: Schema.Uint8Array,
  width: Schema.Number,
  height: Schema.Number,
}).mapFields(Struct.map(Schema.mutableKey))

export type DesktopAPI = {
  openPath?: (path: string, application?: string) => Promise<string | undefined>
  revealPath?: (path: string) => Promise<boolean>
  checkAppExists?: (app: string) => Promise<boolean>
  awaitInitialization: () => Promise<typeof ServerReadyData.Type>
  getCybrosCurrentUser?: () => Promise<CybrosCurrentUser | null>
  openFilePicker?: (options?: typeof FilePickerOptions.Type) => Promise<typeof PickedFiles.Type | null>
  // The preload bridge exposes ArrayBuffer; the RPC adapter converts its Uint8Array payloads.
  readPickedFile?: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles?: (token: string) => Promise<void>
  getPathForFile?: (file: File) => string
  readClipboardImage?: () => Promise<(Omit<typeof ClipboardImage.Type, "buffer"> & { buffer: ArrayBuffer }) | null>
  setBackgroundColor?: (color: string) => Promise<void>
  showNotification?: (title: string, body?: string) => void
}
