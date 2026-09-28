# Code Layout Parity Review

7777 is an independent Git repository. Keep implementations local or use public shared-package exports;
never depend on `packages/app` or `packages/desktop` source, build or runtime. Preserve existing features and
deployment controls.
See the [README](../README.md#code-layout-parity-review) for module boundaries and behavior contracts, and
[AGENTS.md](../AGENTS.md) for deployment rules. Earlier audits remain in Git.

## Shared and local boundaries

| Public package | Reused responsibility |
| --- | --- |
| `@opencode/client` | Data, catalogs, APIs and transport types |
| `@opencode/session-ui` | Timeline, attachment/comment cards and line-selection types, `DockPrompt`, `SessionReview` |
| `@opencode/gui-extensions` | `ContextUsage` |
| `@opencode/ui`, `@opencode/util` | Controls, touch-aware visibility, scrolling, i18n, paths and title fallback |

Local schema/persistence, composer DOM/selection/suggestion sizing and permission notifications follow the main app's
module boundaries; see the README for their contracts. Composer caret reads, attachment capture and rendering share
`composer/editor/dom.ts`. Attachment format detection and picker filters share `runtime/platform/file-picker.ts`;
errors and focus use the attachment/editor boundaries. Notification delivery uses the shell boundary.
Shared UI packages own Markdown dependencies.
Remaining compact responsibilities:

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and recent-session search.
- One disposable root/data instance and SSE stream per activation, cancellation and snapshot guards. Start at 36
  records; follow nonempty cursors to nine user/shell roots or end, excluding queued prompts. Hydrate missing
  messages; retain live rows/HTTP receipts until acknowledged.
- Draft/history formats, inline-URL attachment policy, mentions, comments, undo/redo and request routing.
  Queue undo rejects hidden/malformed context, cancels before merging the latest draft, and guards stale activations.
- Scroll pause/resume; source model defaults, visibility and scoped choices; lazy, retryable OAuth reads; review lifecycle,
  three context lines, bounded patches and 100 ms file-event coalescing.

## Meeting features

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,tab,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store,path,watcher}.*`, `shell/state/session-tabs.ts` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. A rounded, resizable left panel with a PLM-specific width preference. File tabs follow the main app's preview/open/close state boundary: single-click previews are replaceable, double-click or Keep open retains a file, and closing selects a neighbor or the conversation. Tabs live in memory for the active workspace/server; no routed persistence or drag reordering. Only the selected file is read and rendered, with workspace-filtered watcher updates through the existing event stream. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |
| Recorder | `session/header/recorder-control.tsx` | Controls process-wide recording and submits stopped MP3 recordings for transcription. |
| PLM projects | `my-todo/{project-selector,select-project-dialog}.tsx`, `my-todo/project-selector-compact.tsx`, `runtime/server/sync-project-compact.ts` | Selector and dialog follow the main app's boundaries and receive explicit server/project props. The compact adapter owns the active scope; project sync owns list reads, saved records, and `project.updated` events through the existing SSE stream. Reads can be retried and refresh when the stream reconnects. Sessions in one project reuse the loaded record; changing server/project disposes the old scope. Late reads and saves cannot replace a newer update or dismiss another dialog. Selection is exposed to assistive technology. No multi-server project inventory, routing, or sidebar selector. |

## Requires a product decision

Ask before adding queue editing/reordering, provider credentials, staged/history/comment review, extension docking,
terminal, full usage/summary panels, browser, remote servers or extension hosting. Public APIs lack atomic queue
reordering, staged-only/end-revision diffs and GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck`, `bun run build`, and browser interactions without restarting app/server.
Keep evidence in ignored `node_modules/.cache/`. For session/timeline changes, compare production benchmarks:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
```

Optional checks: `BENCH_VERIFY_REVIEW=true` or `BENCH_VERIFY_UI=true`; overrides: `BENCH_BROWSER`, `BENCH_DIST`, `BENCH_OUTPUT`.
The historical 38 px initial-follow failure also reproduced on unchanged baselines; retain its assertion and
resolve it before claiming a scrolling fix.
