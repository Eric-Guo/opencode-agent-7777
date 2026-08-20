import type { FileDiffInfo } from "@opencode-ai/client/promise"
import { Data } from "effect"

export type SummaryDiff = FileDiffInfo

// 7777-only row appended after a turn's projected rows; all other rows come from the shared
// @opencode-ai/session-ui/timeline/projection TimelineRow union.
export class TimelineDiffSummary extends Data.TaggedClass("DiffSummary")<{
  userMessageID: string
  diffs: SummaryDiff[]
}> {}
