# Code Layout Parity Review

7777 is an independent Git repository, with the PLM meeting checkout on a linked branch. Both consume public
workspace exports and own their source and assets; there are no runtime or build imports from `packages/app` or
`packages/desktop`. Matching filenames indicate local ownership, not reuse.
Paths below are relative to `src/` unless a package is named.

This is a scoped comparison, not a full upstream audit. The committed-review follow-up uses parent `3064ac5302`
and PLM meeting baseline `9bedf52` (2026-10-06). The review-source comparison uses parent `3064ac5302`
and PLM meeting baseline `9f08311` (2026-10-06). The earlier turn-review comparison used parent `b1ca206548`
and PLM meeting baseline `09dbfda`. The scrolling comparison used compact baseline `2055671`.
Earlier runtime, restoration, Console grouping, and ChatGPT-plan
comparisons, including their measurements, remain in this document's Git history.

## Shared packages and local ownership

| Area | Public reuse | Remaining local responsibility |
| --- | --- | --- |
| Timeline | `@opencode/session-ui` timeline, document, actions, context, markdown and cards | Nine-dialog projection, reasoning visibility, revert presentation |
| Scrolling | `ScrollView` and keyboard ownership helpers from `@opencode/ui/scroll-view`; `createAutoScroll` from `@opencode/ui/hooks` | Activation reset, viewport observation, arrival check, Jump to latest control |
| Session runtime | `createData` from `@opencode/client/solid` | Activation lifecycle, bounded hydration, optimistic presentation, compatibility rows |
| Transport/platform | `@opencode/client/promise` | Authenticated request queue, one SSE stream, desktop RPC, Electron gate, embedded mount |
| Models/providers | Shared location resources, lazy integration reads, UI primitives | Source defaults/visibility, Console grouping, server precedence, variants, manager gate, selection, ChatGPT-plan footer |
| Composer | Shared agent/skill/command resources, attachment cards and controls | Editor, request serialization, accepted history, drafts, independent catalog failures |
| File mentions | `encodeFilePath` from `@opencode/util/path` and shared icons | Directory search, cancellation, absolute server URI composition |
| Requests | Shared `DockPrompt` and `DockSurface` | Directory-wide discovery, child-session selection, replies, notifications, web-search handoffs |
| Queue/revert | Public client/schema types | Queue/steer actions, lossless undo, loaded-history undo/redo, activation guards |
| Recent sessions | Promise client | Directory-bound title/ID search, 12-session cursor pages, header popover |
| Settings/embedding | UI controls and shared i18n primitives | Synchronous storage formats, tab isolation, preferences, welcome content, title policy |
| Context usage | `@opencode/gui-extensions/usage/context-usage` | Active-session token/model adapter in `session/header/session-context-usage-compact.tsx` |
| Change review | `SessionReview` from `@opencode/session-ui/session-review`, public session/VCS APIs and VCS mode type, shared dialog/select/input controls | Lazy dialog, turn/working-tree/branch/committed sources, shared base form, refresh lifecycle, errors and retry |

## Remaining gaps

- Queue editing and reordering. The public inbox API has no atomic reorder operation; upstream recreates a suffix
  of prompts and cancels the originals. Partial failures and concurrent delivery need separate work.
- Provider connection and credential-management flows.
- Staged-only review, arbitrary history-range selection, review comments, and extension panel docking.
  The compact dialog supports latest-turn, working-tree, branch/base, and committed/base comparisons. The public VCS API
  exposes `working`, `branch`, and `committed`; it has no staged-only mode or end-revision parameter. Working-tree review
  includes staged changes. Committed review compares the base's common ancestor with `HEAD`, excluding uncommitted files.
- Terminal, full usage/summary panels, browser, remote servers and the extension host.
  The GUI extension renderer host lives in `packages/app` and depends on app routing, tabs, settings and server
  contexts. Public built-in definitions alone do not supply that host.

## Intentional constraints

- Keep `HISTORY_DIALOG_LIMIT = 9`, the `current/9` header, and cursor hydration without visible history pagination.
- Keep `SET_DOCUMENT_TITLE = false`, Electron activation gating, and the embedding host's title ownership.
- Keep source-controlled model defaults/visibility and `manageModels`.
- Keep tab-specific session/draft keys, accepted prompt history, local welcome content, and package-owned assets.
- Keep directory-wide request discovery; shared per-session request methods do not replace that contract.

## Runtime and restoration contracts

`runtime/server/runtime.ts` owns one disposable Solid root and shared data instance per activation, plus its abort
signal, subscriptions and refresh work. The compact store publishes derived views; streamed content retains shared
reactive references. Five catalogs load for the composer and models; integration metadata loads lazily without
full-location or extension bootstrap.

The shared layer handles 35 of the former reducer's 36 event kinds. Local compatibility covers skill activation,
selection predecessors/metadata, and hydration for missing messages. History starts at 36 records and follows
cursors until nine user/shell roots are present or history ends. Empty/duplicate pages and repeated cursors stop
hydration; queue items do not consume dialogs. Live rows and events newer than a snapshot survive refreshes.
Temporary HTTP mutation receipts remain until SSE or a subsequent snapshot acknowledges them.

`composer/prompt.ts` reconstructs historical and queued prompts in the existing draft format, including file, agent
and skill mentions. Historical files retain their server URI/query; queued files retain their bytes. Historical
offsets may be recovered from visible text. Queued restoration requires valid, non-overlapping ranges and refuses
hidden context the draft cannot preserve. `session/composer/queue.ts` cancels before restoring, appends to the latest
draft, restores focus, and guards against activation changes.

## Scrolling parity (2026-10-06)

`session/screen.tsx` uses the main app's public `ScrollView`, including its focusable viewport, keyboard navigation,
nested-scroll ownership and draggable scrollbar. Existing spacing applies to that viewport, including the embedded
container breakpoint. `session/timeline/interaction.ts` retains `createAutoScroll` for wheel handling, selection
pause, following and overflow anchoring. Its content/viewport observer covers late rendering and composer/dock resize.

Upward keyboard navigation pauses before smooth scrolling begins. A local arrival check follows the main app's
interaction rule: a delayed event at the bottom must not cancel that pause; moving down to the end or collapsing
content to the end can resume following. **Jump to latest** and activation changes still explicitly resume.
The compact screen owns this control; the main app puts it in its virtualizer. Nine dialogs need no virtualizer.

During the earlier scrolling comparison, the reported 38 px initial-follow failure did not reproduce on its unchanged
baseline. No fix was claimed; its assertion remains, and the current review validation below reproduces it again.
The keyboard check exposed a delayed-scroll race during the scrolling refactor and passed with the arrival check.
That refactor added no app imports, new runtime dependencies, polling, or gesture timers.

## Models and providers

`providers/catalog/console.ts` and `providers/models/provider-group.tsx` follow the main app's Console boundaries.
The adapter preserves integration/canonical identity; workspace detection precedes search filtering. Shared local
headers and ordering keep nested groups, independent collapse state, provider switches, full-catalog search toggles,
and future-model defaults. Direct and incomplete provider catalogs retain their existing sections.

`providers/catalog/integrations.ts` reads the public shared integration resource only while the selector is open
with an OpenAI model selected. An active OAuth connection enables **Using ChatGPT plan** and **Manage usage**; API keys,
environment connections, inactive OAuth connections and Console providers do not. The link uses
`runtime/platform/external-link.tsx`. Existing SSE connection/reconnect events refresh reads; reopening retries.
Failed or stale reads hide the optional footer, and activation disposal aborts reads. No metadata is persisted.
The footer remains available with `manageModels = false`.

## Turn review parity (2026-10-06)

The header's **Review turn changes** control opens a lazy dialog. `review/model.ts` and `review/panel.tsx` follow
the review extension's model/panel boundary, which moved out of the main app into `packages/gui-extensions`.
`review/trigger-compact.tsx` replaces extension-host mounting with the existing dialog provider. Rendering, file
accordions, change counts, split/unified controls, large-diff handling and diff scrolling use the public
`@opencode/session-ui/session-review` component. No copied diff renderer or new dependency is needed.

The model reads `session.diff` for the latest turn with three context lines. It is created only while the dialog is
open and refreshes after execution completes, fails or is interrupted, after revert changes, on stream reconnection,
and on explicit refresh. It reuses the existing event stream. Superseded reads and activation disposal abort requests;
late responses cannot replace newer data. Closing disposes the listener and pending read; switching activation closes
only this dialog. Read failures have a retry action, and valid empty results have an explicit empty state.

Latest-turn review is snapshot-backed; sessions without recorded snapshot changes can return an empty result.
Bounded patches do not supply full-file context or historical media bytes. The dialog leaves
the draft, nine-dialog window, and existing header actions unchanged, along with file tabs and the recorder in PLM meeting.

## Review source parity (2026-10-06)

`review/model.ts` now owns a selected source and one cancellable read lifecycle for both public diff APIs.
Latest turn remains the initial source and keeps the existing `session.diff` request. Working tree and Branch changes
use `vcs.diff`, with the directory captured from the active session and three context lines. Working tree includes
staged, unstaged, and untracked files. Branch changes compares against the common ancestor with the default branch
or an explicitly applied base reference, including uncommitted changes. These semantics come from the server;
the renderer does not execute Git commands or inspect its own checkout.

`review/parts.tsx` follows the extension's title/control boundary and uses public `Select` and `TextInput` controls.
Typing a base does not issue reads; Compare or Enter applies it. The description names the applied base, and failures
leave the controls available to choose another reference or retry. Modes have distinct empty states. New English
copy uses the existing locale fallback until translations are reviewed.

Changing source aborts the previous read and clears its result; stale successes and failures cannot overwrite the
current comparison. Only VCS modes react to matching-directory `filesystem.changed` events, coalescing bursts at
100 ms as the extension does. Turn completion, revert, reconnect and manual refresh retain the existing lifecycle.
Closing or changing activation cancels pending work and scheduled refreshes. Opening the dialog performs only the
existing turn read; VCS reads begin when selected. Server failures use the existing error/retry surface. No extension
host, new dependency, app/desktop import, or persisted preference is introduced.

## Committed-review follow-up (2026-10-06)

The compact model now derives its VCS modes from the public client's `VcsDiffInput` type and supports the existing
`committed` API mode. The upstream review extension still offers turn, working-tree, and branch modes; committed
review closes the public-API gap recorded above, rather than copying a new upstream control. Base normalization,
bounded patches, cancellation, watcher refreshes, and error handling use the existing lifecycle for every VCS mode.

`review/parts.tsx` now owns the description and `ReviewEmpty` alongside `ReviewTitle`, following the extension's
presentation boundary. Branch and committed modes use the same form and retain its value when switching. Typing alone
does not fetch, and the description shows the applied reference. The panel continues using the public shared diff
renderer. No imports from app/desktop, private extension modules, new dependencies, or server changes are introduced.
Existing modes, recorder, file tabs, draft storage, and the nine-dialog limit remain unchanged. New English keys use
the existing locale fallback; the Chinese dictionary now allows untranslated keys without copying English entries.

Validation passes 498 tests across 74 files, package typecheck, the default and browser-enabled production builds,
and the parent repository's `bun run check`. The extended production review fixture passes rendered diffs, base
application and clearing, invalid-base recovery, mode-specific empty states, desktop and 390 px controls, draft
preservation, and listener cleanup, with no page errors. Model coverage includes a branch-to-committed switch with
the same base, late successes/failures, retry, and disposal. The running development page also selects committed
review and applies `HEAD` without restarting either process. The unrelated full scrolling fixture was not rerun.

Five production samples per bundle produced these medians (ms):

| Fixture | Before (`9bedf52`) | After |
| --- | --- | --- |
| Session entry | 161.9 | 160.5 |
| Session switching | 152.1 | 172.6 |
| 160 text deltas | 53.5 | 53.2 |

These small samples do not establish a performance change. Review stays lazy, and committed reads begin only when
selected. Logs, results, and screenshots are ignored under `node_modules/.cache/review-committed-*`.

## Validation and coverage

| Contract | Coverage owner |
| --- | --- |
| Shared projections, snapshots, hydration, HTTP/SSE races, disposal | Runtime and global-sync suites |
| Submission, restoration, references, queue cancellation, revert | Composer, queue and revert suites |
| Catalog defaults, deduplication, independent failures, isolation | Composer/provider catalog suites |
| Console identity and metadata, active OAuth, lazy/stale/failed reads | Console/integrations suites; runtime disposal regression |
| Nine dialogs, shell roots, revert boundary | Timeline model and session-domain suites |
| Following, wheel/keyboard/scrollbar reading during streaming, selection, resize, activation reset | Production fixture in `scripts/runtime-benchmark.ts` |
| Directory-wide requests, persistence, embedding/platform behavior | Request, storage/schema, platform and layout suites |
| Demand loading, bounded/scoped requests, source/base transitions, cancellation, late responses, retry, watcher coalescing | `review/model.test.ts` |
| Review dialog, real shared diff rendering, source/base selection, failed-read recovery, empty state, narrow controls, draft preservation | Review checks in `scripts/runtime-benchmark.ts` |

The earlier scrolling comparison passed 373 tests and its extended browser fixture. In the PLM meeting review work,
489 tests across 74 files, typecheck, and production build pass. The full browser fixture stops at its initial-follow
assertion: a 38 px bottom gap reproduces on both the PLM meeting review build and an isolated, unchanged `09dbfda`
build with the same installed Chrome. That assertion remains unchanged; the later scrolling checks are not claimed
as passing in that run.

The PLM meeting review browser checks pass with real shared diff rendering, desktop and 390 px layouts, failed-read
retry, empty results, keyboard dismissal and preservation of the composer draft. The fixture reports no page errors.
The running development page also opens, refreshes and dismisses the dialog; neither app nor server was restarted.

The 7777 cherry-pick passes 380 tests across 62 files, package typecheck, the default production build, and the
monorepo's `bun run check`. A separate browser-enabled production build passes one review fixture run covering
real shared diff rendering, desktop and 390 px layouts, failed-read retry, empty results, keyboard dismissal,
and draft preservation, with no page errors. The full scrolling fixture was not rerun for this cherry-pick.

The review comparison's five production samples per bundle produced these medians (ms):

| Fixture | Before | After |
| --- | --- | --- |
| Session entry | 161.7 | 157.3 |
| Session switching | 172.5 | 172.0 |
| 160 text deltas | 53.0 | 51.3 |

This small sample establishes no performance change. Results, diagnostic fixtures and screenshots are ignored under
`node_modules/.cache/review-parity-*`. The earlier scrolling measurements remain in Git history.

The review-source refactor passes 495 tests across 74 files, typecheck, the default production build, and a
browser-enabled production build. Its extended review fixture passes real working-tree and branch diff rendering,
captured-directory/bounded requests, explicit base application, invalid-base recovery, switching back to the original
turn empty state, desktop and 390 px layouts (including clicking Compare), keyboard dismissal, listener disposal,
and draft preservation, with no page errors. The running development page also applies a base and dismisses the
dialog without restarting either process. The unrelated full scrolling fixture was not rerun.

Five production samples per bundle produced these medians (ms):

| Fixture | Before (`9f08311`) | After |
| --- | --- | --- |
| Session entry | 173.6 | 159.7 |
| Session switching | 153.5 | 172.7 |
| 160 text deltas | 51.9 | 54.0 |

These small samples do not establish a performance improvement or regression. Review remains lazy and performs
no VCS reads before a VCS source is selected. Results, build logs, and screenshots are ignored under
`node_modules/.cache/review-modes-*`.

```sh
bun test
bun run typecheck
bun run build
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_VERIFY_UI=true bun run bench:runtime
BENCH_VERIFY_REVIEW=true bun run bench:runtime
```

The fixture uses Playwright Chromium. Set `BENCH_BROWSER=<chromium-executable>` for an existing installation,
`BENCH_RUNS` for the sample count, `BENCH_OUTPUT` for results, and `BENCH_DIST` for another production bundle.
`BENCH_VERIFY_REVIEW=true` runs review integration checks independently of the scrolling checks; the full
`BENCH_VERIFY_UI=true` suite includes both.
