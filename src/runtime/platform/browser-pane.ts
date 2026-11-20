import { Schema } from "effect"

const Coordinate = Schema.Finite.check(Schema.isBetween({ minimum: -100_000, maximum: 100_000 }))
const TabID = Schema.String.check(Schema.isPattern(/^tab_[a-f0-9-]{36}$/))
const Address = Schema.String.check(Schema.isMaxLength(2048))

export const BrowserPaneBounds = Schema.NullOr(
  Schema.Struct({ x: Coordinate, y: Coordinate, width: Coordinate, height: Coordinate }),
)
export type BrowserPaneBounds = typeof BrowserPaneBounds.Type

export const BrowserPaneAction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open") }),
  Schema.Struct({ type: Schema.Literal("navigate"), tabID: TabID, url: Address }),
  Schema.Struct({
    type: Schema.Literals(["back", "forward", "reload", "focus", "close"]),
    tabID: TabID,
  }),
])
export type BrowserPaneAction = typeof BrowserPaneAction.Type

export type BrowserPaneTab = {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly loadError?: string
}

export type BrowserPaneState = {
  readonly status: "inactive" | "connecting" | "ready" | "disconnected" | "replaced" | "restart"
  readonly tabs: readonly BrowserPaneTab[]
  readonly focusedTabID: string | null
  readonly reveal: number
}

export type BrowserPaneAPI = {
  refresh(): Promise<void>
  layout(bounds: BrowserPaneBounds): Promise<void>
  command(action: BrowserPaneAction): Promise<void>
  subscribe(listener: (state: BrowserPaneState) => void): () => void
}
