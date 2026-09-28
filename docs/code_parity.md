# Code Layout Parity Review

7777 is an independent Git repository. It consumes public workspace exports and keeps its own source and assets;
there are no runtime or build imports from `packages/app`. Matching filenames indicate local ownership, not reuse.
Paths below are relative to `src/` unless a package is named.

The original assessment used parent `5d84cc330f` and compact `ea429ea` (2026-10-01), including GUI extension
PR #52369. Prompt restoration was compared with parent `7ebf66c36f` (2026-10-02). The scrolling follow-up below
compares parent `59b3b8dd0c` and compact `ec4fc8c` (2026-10-03). These are scoped comparisons, not a full audit of
all subsequent upstream changes. Earlier migration notes and measurements remain in this document's Git history.

## Shared packages and local ownership

| Area | Public reuse | Remaining local responsibility |
| --- | --- | --- |
| Timeline | `@opencode/session-ui` timeline, document, actions, context, markdown and cards | Nine-dialog projection, reasoning visibility, revert presentation |
| Scrolling | `createAutoScroll` from `@opencode/ui/hooks` | Activation reset, viewport observation, Jump to latest control |
| Session runtime | `createData` from `@opencode/client/solid` | Activation lifecycle, bounded hydration, optimistic presentation, compatibility rows |
| Transport/platform | `@opencode/client/promise` | Authenticated request queue, one SSE stream, desktop RPC, Electron gate, embedded mount |
| Models/providers | Shared data location resources and UI primitives | Source defaults/visibility, server precedence, variants, manager gate and selection |
| Composer | Shared agent/skill/command resources, attachment cards and controls | Editor, request serialization, accepted history, drafts, independent catalog failures |
| File mentions | `encodeFilePath` from `@opencode/util/path` and shared icons | Directory search, cancellation, absolute server URI composition |
| Requests | Shared `DockPrompt` and `DockSurface` | Directory-wide discovery, child-session selection, replies, notifications, web-search handoffs |
| Queue/revert | Public client/schema types | Queue/steer actions, lossless undo, loaded-history undo/redo, activation guards |
| Recent sessions | Promise client | Directory-bound title/ID search, 12-session cursor pages, header popover |
| Settings/embedding | UI controls and shared i18n primitives | Synchronous storage formats, tab isolation, preferences, welcome content, title policy |
| Context usage | `@opencode/gui-extensions/usage/context-usage` | Active-session token/model adapter in `session/header/session-context-usage-compact.tsx` |

## Meeting features

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,tab,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store,path,watcher}.*`, `shell/state/session-tabs.ts` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. A rounded, resizable left panel with a PLM-specific width preference. File tabs follow the main app's preview/open/close state boundary: single-click previews are replaceable, double-click or Keep open retains a file, and closing selects a neighbor or the conversation. Tabs live in memory for the active workspace/server; no routed persistence or drag reordering. Only the selected file is read and rendered, with workspace-filtered watcher updates through the existing event stream. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |
| Recorder | `session/header/recorder-control.tsx` | Controls process-wide recording and submits stopped MP3 recordings for transcription. |
| PLM projects | `my-todo/{project-selector,select-project-dialog}.tsx`, `my-todo/project-selector-compact.tsx`, `runtime/server/sync-project-compact.ts` | Selector and dialog follow the main app's boundaries and receive explicit server/project props. The compact adapter owns the active scope; project sync owns list reads, saved records, and `project.updated` events through the existing SSE stream. Reads can be retried and refresh when the stream reconnects. Sessions in one project reuse the loaded record; changing server/project disposes the old scope. Late reads and saves cannot replace a newer update or dismiss another dialog. Selection is exposed to assistive technology. No multi-server project inventory, routing, or sidebar selector. |

## Intentional constraints

- Keep `HISTORY_DIALOG_LIMIT = 9`, the `current/9` header, and cursor hydration without visible history pagination.
- Keep `SET_DOCUMENT_TITLE = false`, Electron activation gating, and the embedding host's title ownership.
- Keep source-controlled model defaults/visibility and `manageModels`.
- Keep tab-specific session/draft keys, accepted prompt history, local welcome content, and package-owned assets.
- Keep directory-wide request discovery; shared per-session request methods do not replace that contract.

## Runtime and restoration contracts

`runtime/server/runtime.ts` owns one disposable Solid root and shared data instance per activation, plus its abort
signal, subscriptions and refresh work. The compact store publishes derived views; streamed content retains shared
reactive references. Only the five catalogs used by 7777 are loaded, without full-location or extension bootstrap.

The shared layer handles 35 of the former reducer's 36 event kinds. Local compatibility covers skill activation,
selection predecessors/metadata, and hydration for missing messages. History starts at 36 records and follows
cursors until nine user/shell roots are present or history ends. Empty/duplicate pages and repeated cursors stop
hydration; queue items do not consume dialogs. Live rows and events newer than a snapshot survive refreshes.
Temporary HTTP mutation receipts remain until SSE or a subsequent snapshot acknowledges them.

`composer/prompt.ts` reconstructs historical and queued prompts using the existing compact draft format. It restores
file, agent and skill mentions; historical files retain their server URI/query, while queued files retain their bytes.
Historical offsets may be recovered from visible text. Queued restoration requires valid, non-overlapping ranges
and refuses hidden context that the draft cannot preserve. `session/composer/queue.ts` owns cancellation, appending
to the latest draft, focus restoration and activation guards. Restoration follows successful cancellation only.

## Scrolling follow-up (2026-10-03)

`session/timeline/interaction.ts` now delegates following, wheel handling, text-selection pause, nested scroll-region
handling and overflow anchoring to `createAutoScroll`. The old 250 ms pointer-gesture timer is removed. Reading
position survives streamed content; **Jump to latest** resumes following. Activation changes reset following, and
content/viewport resize observation covers late rendering and composer or request-dock height changes.

The compact screen owns the resume button and keeps the bounded renderer. The main app places its control in a
virtualizer; 7777 does not need that dependency for nine dialogs. Timeline scrolling uses immediate positioning so
CSS smooth scrolling cannot turn intermediate automatic scroll events into a false user pause. Keyboard activation
and English fallback cover the new control. Existing timeline actions, drafts, requests and header controls remain.

## Remaining gaps

- Queue editing and reordering. The public inbox API has no atomic reorder operation; upstream recreates a suffix
  of prompts and cancels the originals. This requires separate work on partial failures and concurrent delivery.
- Provider connections, Console workspace grouping and the ChatGPT-plan footer.
- Files/review panels, terminal, full usage/summary panels, browser, remote servers and the extension host.
  The GUI extension renderer host lives in `packages/app` and depends on app routing, tabs, settings and server
  contexts. Public built-in definitions alone do not supply that host.

## Validation and coverage

| Contract | Coverage owner |
| --- | --- |
| Shared projections, live snapshots, cursor hydration, HTTP/SSE races, disposal | `runtime/server/runtime.test.ts`, global-sync suites |
| Submission, draft restoration, references, queue cancellation, revert | `composer/{prompt,request,submit}.test.ts`, queue and revert suites |
| Catalog defaults, request deduplication, independent failures, isolation | Composer/provider catalog suites |
| Nine-dialog projection, shell roots, revert boundary | `session/timeline/model-compact.test.ts`, session-domain suite |
| Following, pause/resume, streamed growth, selection, resize, activation reset | Production fixture in `scripts/runtime-benchmark.ts` |
| Directory-wide requests, persistence, embedding/platform behavior | Request, storage/schema, platform and layout suites |

Current validation: 370 top-level tests across 59 files, typecheck, and production build pass. Reactive suites run
with Solid's browser condition through the normal test command. The production fixture verifies the real bundle
against an isolated HTTP/SSE endpoint and blocks external requests. The running homepage was also checked through
browser automation; its app and server processes were left running.

Five samples per build on the same machine and installed Chromium produced these medians:

| Fixture | Before | After |
| --- | --- | --- |
| Session entry | 134.9 ms | 133.9 ms |
| Session switching | 153.6 ms | 152.5 ms |
| 160 text deltas | 42.8 ms | 41.9 ms |

This small local sample does not establish a performance change. Results and screenshots are ignored artifacts
under `node_modules/.cache/scroll-parity-*`. The new scroll assertions failed on the original bundle and pass after
the refactor. Prior shared-client tests had workspace-location and browser-condition background-shell failures;
7777's runtime suites cover its adopted behavior without changing or suppressing those upstream tests.

```sh
bun test
bun run typecheck
bun run build
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_VERIFY_UI=true bun run bench:runtime
```

The browser fixture uses Playwright Chromium. Set `BENCH_BROWSER=<chromium-executable>` for an existing installation,
`BENCH_RUNS` for the sample count, `BENCH_OUTPUT` for results, and `BENCH_DIST` for another production bundle.
