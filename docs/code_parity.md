# Code Layout Parity Review

7777 is an independent Git repository: copy/align locally, without feature changes or source/build/runtime dependencies
on `packages/app` or `packages/desktop`. The [README](../README.md#code-layout-parity-review) records boundaries and
consolidated prompt/request helpers; earlier audits remain in Git.

| Package | Shared responsibility |
| --- | --- |
| `@opencode/client` | `createData`, catalogs, APIs, prompt fields and queue/steer types |
| `@opencode/session-ui` | Timeline, attachment/comment cards, `DockPrompt`, `SessionReview` |
| `@opencode/gui-extensions` | `ContextUsage` |
| `@opencode/ui`, `@opencode/util` | Controls, scrolling, i18n, paths and title fallback |

## Closed code boundary gaps

- Session data adaptation now lives in `runtime/server/data.ts`, matching the main app's separation from runtime
  orchestration. `runtime.ts` owns activation lifetime, publication, scheduling and bounded hydration; the adapter
  owns guarded snapshots and optimistic/event overlays around public `createData`. Existing runtime integration
  tests continue to cover their combined behavior. Single-session compatibility stays local.

## Refactor constraints

- Embedding: `current/9`, `SET_DOCUMENT_TITLE = false`, Electron gating, `manageModels`, source defaults/visibility,
  tab-specific keys, Thinking, welcome, local assets. Recent sessions: directory search, 12-row pages, agent title fallback.
- Runtime: one disposable Solid root/data instance and SSE stream per activation; cancellation, reactivity, compatibility,
  snapshot guards. Start at 36 records; follow nonempty cursors to nine user/shell roots or end, excluding queued prompts.
  Hydrate missing messages; retain live rows/HTTP receipts until acknowledged.
- Composer: URIs, mentions, comments, attachment bytes/formats/deduplication, accepted history, loaded-history undo/redo.
  Queue undo: reject hidden/malformed context, cancel before merging the latest draft, restore focus, ignore stale activations.
- Scrolling: ownership, scrollbar, reading/selection pauses, anchoring, delayed-event/resize guards, resume triggers.
- Models: separate catalog/API IDs, isolated capability arrays, tooltip order, costs, variants, Console grouping, search/collapse
  state, full-catalog switches/future defaults, focus restoration. OAuth: optional, lazy, retryable, cancellable,
  event-refreshed, including with `manageModels = false`.
- Requests/review: directory/child routing, notifications, activation/pending-reply guards, drafts, three context lines,
  retry/empty states, existing-stream refresh, 100 ms file-event coalescing and stale-result guards. Compare/Enter applies
  the base; branch includes uncommitted changes from the common ancestor, committed ends at `HEAD`. Retain bounded-patch limits.

## Meeting features

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,file-tab-scroll,tab,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store,path,watcher}.*`, `shell/state/session-tabs.ts` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. A rounded, resizable left panel with a PLM-specific width preference. File tabs follow the main app's preview/open/close state boundary: single-click previews are replaceable, double-click or Keep open retains a file, and closing selects a neighbor or the conversation. File tabs now support horizontal drag reordering and focused Alt+Shift+Arrow keyboard moves through the local `SortableTab` and `shell/state/session-tabs.ts` boundaries. Selection, preview identity, and keyboard focus survive moves; stale drops are ignored. The strip, selection, drag orchestration, and strip styles follow the main app's `session-side-panel.tsx` boundary, using declared `@dnd-kit` dependencies. `file-tabs.tsx` owns selected-file loading and preview through `@opencode/session-ui/file`. `file-tab-scroll.ts` handles selected-tab visibility, resize, and wheel scrolling within the strip. Tabs live in memory for the active workspace/server; no routed persistence. Only the selected file is read and rendered, with workspace-filtered watcher updates through the existing event stream. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |
| Recorder | `session/header/recorder-control.tsx` | Controls process-wide recording and submits stopped MP3 recordings for transcription. |
| PLM projects | `my-todo/{project-selector,select-project-dialog}.tsx`, `my-todo/project-selector-compact.tsx`, `runtime/server/sync-project-compact.ts` | Selector and dialog follow the main app's boundaries and receive explicit server/project props. The compact adapter owns the active scope; project sync owns list reads, saved records, and `project.updated` events through the existing SSE stream. Reads can be retried and refresh when the stream reconnects. Sessions in one project reuse the loaded record; changing server/project disposes the old scope. Late reads and saves cannot replace a newer update or dismiss another dialog. Selection is exposed to assistive technology. No multi-server project inventory, routing, or sidebar selector. |

## Requires a product decision

Ask before adding queue editing/reordering, provider credentials, staged/history/comment review, extension docking,
terminal, full usage/summary panels, browser, remote servers or extension hosting. Public APIs lack atomic queue
reordering, staged-only/end-revision diffs and GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck`, `bun run build`, and browser interactions without restarting app/server.
Save evidence under ignored `node_modules/.cache/`. For session/timeline changes, compare production benchmarks:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
# Optional: BENCH_VERIFY_REVIEW=true or BENCH_VERIFY_UI=true
```

The fixture uses Playwright Chromium; override executable/bundle/results with `BENCH_BROWSER`/`BENCH_DIST`/`BENCH_OUTPUT`.
The historical 38 px initial-follow failure also reproduced on unchanged baselines; retain its assertion and resolve
it before claiming a scrolling fix.
