# Code Layout Parity Review

7777 is an independent Git repository. It consumes public workspace exports and owns its source and assets;
there are no runtime or build imports from `packages/app`. Matching filenames indicate local ownership, not reuse.
Paths below are relative to `src/` unless a package is named.

This is a scoped comparison, not a full upstream audit. The latest scrolling comparison uses parent `b1ca206548`
and compact baseline `2055671` (2026-10-06). Earlier runtime, restoration, Console grouping, and ChatGPT-plan
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

## Remaining gaps

- Queue editing and reordering. The public inbox API has no atomic reorder operation; upstream recreates a suffix
  of prompts and cancels the originals. Partial failures and concurrent delivery need separate work.
- Provider connection and credential-management flows.
- Review/diff panels, terminal, full usage/summary panels, browser, remote servers and the extension host.
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

The previously reported 38 px initial-follow failure did not reproduce on the unchanged baseline with the current
shared packages and browser. No fix is claimed for that historical failure; its assertion remains. The new keyboard
check exposed a delayed-scroll race during this refactor and passes with the arrival check. No app imports, new
runtime dependencies, polling, or gesture timers were added.

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

Current validation: 373 tests across 61 files, typecheck, and production build pass. The extended production browser
fixture passes, including Page Up while streaming, End restoring following, scrollbar dragging, and the existing
scrolling/composer/host-title checks. The new viewport checks reject the baseline, which has no focusable ScrollView
region. The running homepage hot-reloaded successfully and reported no browser errors; its app/server stayed running.

Five production samples per bundle produced these medians (ms):

| Fixture | Before | After |
| --- | --- | --- |
| Session entry | 129.6 | 131.5 |
| Session switching | 145.8 | 147.2 |
| 160 text deltas | 42.6 | 42.1 |

This small sample establishes no performance change. Results, diagnostic fixtures and screenshots are ignored under
`node_modules/.cache/scroll-parity-current/`.

```sh
bun test
bun run typecheck
bun run build
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_VERIFY_UI=true bun run bench:runtime
```

The fixture uses Playwright Chromium. Set `BENCH_BROWSER=<chromium-executable>` for an existing installation,
`BENCH_RUNS` for the sample count, `BENCH_OUTPUT` for results, and `BENCH_DIST` for another production bundle.
