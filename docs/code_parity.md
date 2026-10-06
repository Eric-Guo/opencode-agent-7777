# Code Layout Parity Review

7777 is an independent Git repository. Runtime code, build configuration and assets must not import from
`packages/app` or `packages/desktop`; public OpenCode workspace exports are reusable. Matching filenames describe
local ownership, not shared code. Paths below are relative to `src/` unless a package is named.

This is a scoped assessment, not a full upstream audit. The earlier comparison used parent `3064ac5302` and included
PLM meeting work; its measurements and detailed change history remain in this document's Git history. The current
refactor was checked against 7777 baseline `3752d7e` on 2026-10-06. Validation below applies to this checkout only.

## Shared code and local boundaries

| Area | Public reuse | Local responsibility / boundary |
| --- | --- | --- |
| Timeline | `@opencode/session-ui` timeline, document, actions, context, markdown and cards | `session/timeline/`: nine-dialog projection, binary Thinking preference, revert and historical comment presentation |
| Scrolling | `ScrollView` and keyboard ownership from `@opencode/ui/scroll-view`; `createAutoScroll` from `@opencode/ui/hooks` | `session/screen.tsx` owns the viewport and Jump to latest; `session/timeline/interaction.ts` owns activation, resize and arrival checks |
| Session runtime | `createData` from `@opencode/client/solid` | `runtime/server/runtime.ts`: activation, bounded hydration, optimistic overlays, compatibility rows and snapshot races |
| Transport/platform | `@opencode/client/promise` | `runtime/server/` and `runtime/platform/`: authentication, shared request budget, one SSE stream, desktop RPC and embedded mount |
| Models/providers | Shared location resources and UI primitives | `providers/catalog/` and `providers/models/`: source defaults, visibility, Console grouping, selection, variants, lazy ChatGPT-plan footer and manager gate |
| Composer | Shared agent/skill/command resources, attachment cards and controls | `composer/`: editor, serialization, drafts, accepted history and independent catalog failures |
| File mentions | `encodeFilePath` from `@opencode/util/path` and shared icons | `workspaces/files/{model,path}`: directory search, cancellation and absolute server URI composition |
| Requests | Shared `DockPrompt` and `DockSurface` | `session/requests/`: directory-wide discovery, child-session selection, replies, notifications and web-search handoffs |
| Queue/revert | Public client/schema types | `session/composer/queue.ts`, `session/revert.ts`, `composer/prompt.ts`: queue/steer actions, lossless restoration, loaded-history undo/redo and activation guards |
| Recent sessions | Promise client; `displayLabel` from `@opencode/util/session-title-fallback` | `home/sessions/` and `session/title.ts`: directory-bound title/ID search, 12-session cursor pages, header popover and absent-title agent fallback |
| Settings/embedding | UI controls and shared i18n primitives | Synchronous storage formats, tab isolation, preferences, local welcome content and title policy |
| Context usage | `@opencode/gui-extensions/usage/context-usage` | `session/header/session-context-usage-compact.tsx`: active-session token/model adapter |
| Change review | `@opencode/session-ui/session-review`, public session/VCS APIs and UI controls | `review/{model,panel,parts}` follows the GUI extension boundaries; `trigger-compact.tsx` mounts a lazy dialog without an extension host |

## Contracts refactors must preserve

- **Embedding and limits:** `HISTORY_DIALOG_LIMIT = 9`, the `current/9` header, `SET_DOCUMENT_TITLE = false`, Electron
  activation gating, source-controlled model defaults/visibility, `manageModels`, tab-specific session/draft keys,
  accepted prompt history, local welcome content and package-owned assets are intentional constraints.
- **Runtime:** one disposable Solid root and shared data instance per activation owns cancellation, subscriptions and
  refresh work. Streamed content keeps shared reactive references. Five catalogs load for composer/models; integration
  metadata is lazy. Shared data handles 35 of the former reducer's 36 event kinds; local compatibility retains skill
  activation, selection predecessors/metadata and hydration for missing messages.
- **History:** start with 36 records and follow cursors until nine user/shell roots or history end. Empty/duplicate
  pages and repeated cursors stop hydration; queued prompts do not consume dialogs. Live rows and events newer than a
  snapshot survive refreshes. HTTP mutation receipts remain until SSE or a subsequent snapshot acknowledges them.
- **Restoration:** `composer/prompt.ts` reconstructs historical and queued prompts in the existing draft format.
  Historical file URIs/queries survive; visible text can recover shifted offsets. Queue undo retains full text and
  file bytes, rejects hidden context or malformed/overlapping mentions, cancels before appending to the latest draft,
  restores focus and ignores stale activations. Undo/redo operates on loaded history.
- **Presentation:** `composer/comment-note.ts` keeps one compatibility reader for both legacy comment metadata and
  prompt presentation. It skips malformed comments, recovers optional fields and retains numeric selection coercion.
  Timeline rendering and prompt restoration use that boundary; the editor owns the shared local `FileSelection` type.
  Session title normalization delegates to the public formatter while empty/missing recent-session titles still fall
  back to the local agent. These are behavior-preserving refactors, not new comment or title features.
- **Scrolling:** shared viewport keyboard navigation, nested-scroll ownership and draggable scrollbar coexist with
  selection/wheel pause and overflow anchoring. Upward keys pause before smooth scrolling; delayed bottom events must
  not cancel that pause. Moving down to the end, content collapse, Jump to latest and activation changes can resume
  following. The observer covers late rendering and viewport/composer/dock resize; nine dialogs need no virtualizer.
- **Models:** Console identity/canonical metadata and workspace detection precede search filtering. Nested groups,
  independent collapse state, full-catalog visibility switches and future-model defaults remain. With an OpenAI model
  selected, opening the selector lazily checks active OAuth metadata for Using ChatGPT plan / Manage usage. API keys,
  environment/inactive connections and Console providers do not show it. Failures hide only this optional footer;
  reconnect/connection events refresh it, reopening retries, and disposal aborts reads. It also works with
  `manageModels = false`; selection/Escape restores composer focus.
- **Requests:** shared per-session methods do not replace directory-wide discovery and child-session handling.
- **Review:** turn is the initial source; working, branch and committed use public `vcs.diff` scoped to the captured
  session directory with three context lines. Working includes staged/unstaged/untracked files. Branch compares the
  base's common ancestor with the working tree; committed ends at `HEAD`. Branch/committed share the base form; typing
  alone does not fetch, Compare/Enter applies it, and the description names the applied base.
- **Review lifecycle:** opening reads only turn diffs; VCS reads start when selected. Completion/failure/interruption,
  revert, reconnect and manual refresh reuse the existing stream. VCS modes coalesce matching-directory file events
  at 100 ms. Source changes clear results and abort reads; stale results/errors cannot replace the new comparison.
  Closing or activation changes dispose reads/listeners/timers. Errors retain controls and retry; sources have distinct
  empty states. Snapshot-backed turn results may be empty, and bounded patches omit full-file context/media bytes.
  Review remains lazy and preserves drafts. New English keys use locale fallback pending translation review.

## Feature gaps requiring a separate decision

These are not closed by a refactor and must not be added, removed or reinterpreted without product approval:

- Queue editing/reordering. The public inbox API has no atomic reorder; upstream recreates a suffix and cancels the
  originals, leaving partial failures and concurrent delivery to address.
- Provider connection and credential management.
- Staged-only review, arbitrary history ranges, comments and extension panel docking. Public VCS modes are `working`,
  `branch` and `committed`; there is no staged-only mode or end-revision parameter.
- Terminal, full usage/summary panels, browser, remote servers and extension hosting. Public built-in definitions do
  not provide the GUI renderer host, which depends on app routing, tabs, settings and server contexts.

## Validation

| Contract | Coverage owner |
| --- | --- |
| Shared projections, snapshots, hydration, HTTP/SSE races, disposal | Runtime and global-sync suites |
| Submission, restoration, references, queue cancellation, revert | Composer, queue and revert suites |
| Historical presentation compatibility and session labels | `composer/comment-note.test.ts`, `session/title.test.ts` |
| Catalog defaults, deduplication, independent failures, Console/OAuth metadata, isolation | Composer/provider catalog suites and runtime disposal regression |
| Nine dialogs, shell roots, revert boundary | Timeline model and session-domain suites |
| Following, reading during streaming, selection, resize, activation reset | UI checks in `scripts/runtime-benchmark.ts` |
| Directory-wide requests, storage, embedding/platform behavior | Request, persistence/schema, platform and layout suites |
| Review source/base transitions, cancellation, late replies, retry, watcher coalescing | `review/model.test.ts` |
| Rendered review diffs, source/base controls, failures, empty state, narrow layouts, drafts | Review checks in `scripts/runtime-benchmark.ts` |

This refactor passes 392 tests across 63 files, typecheck, the default production build and a browser-enabled build.
Three production samples per bundle give these medians (ms):

| Fixture | Before (`3752d7e`) | After |
| --- | --- | --- |
| Session entry | 144.1 | 146.1 |
| Session switching | 153.9 | 148.0 |
| 160 text deltas | 50.2 | 50.1 |

These small samples establish no performance change. The fixture reports no page errors. The running development
page also opens, searches and dismisses Recent sessions with its existing titles and agent fallback intact, without
restarting the app or server. Results and build logs are ignored under `node_modules/.cache/parity-refactor/`.

The extended review and full scrolling checks were not rerun for this refactor. Earlier runs reproduced a 38 px
initial-follow failure on both changed and unchanged baselines; their later scrolling checks were not claimed as
passing. That assertion remains in the fixture. No scrolling fix or new feature is claimed here.

```sh
bun test
bun run typecheck
bun run build
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
# Optional extended checks, independent review checks or the full UI suite:
BENCH_VERIFY_REVIEW=true bun run bench:runtime
BENCH_VERIFY_UI=true bun run bench:runtime
```

The production fixture uses Playwright Chromium. Set `BENCH_BROWSER=<chromium-executable>` for an existing browser,
`BENCH_OUTPUT` for results and `BENCH_DIST` for another bundle. `BENCH_VERIFY_REVIEW` runs review checks independently;
`BENCH_VERIFY_UI` includes scrolling and review. Historical measurements and screenshots remain in Git history or
ignored `node_modules/.cache/` artifacts, not as evidence of a current run.
