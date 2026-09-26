# Code Layout Parity Review

7777 is an independent Git repository: use local implementations or public shared-package exports, never
`packages/app` or `packages/desktop` source at build or runtime. Preserve existing features and deployment controls.
The [README](../README.md#code-layout-parity-review) owns detailed boundaries and contracts;
[AGENTS.md](../AGENTS.md) owns deployment rules. Earlier audits remain in Git.

## Shared and local boundaries

| Public package | Reused responsibility |
| --- | --- |
| `@opencode/client` | Data, catalogs, APIs and transport types |
| `@opencode/session-ui` | Timeline, attachment/comment cards, line-selection types, `DockPrompt`, `SessionReview` |
| `@opencode/gui-extensions` | `ContextUsage` |
| `@opencode/ui`, `@opencode/util` | Controls, image previews, touch visibility, scrolling, i18n, paths and titles |

Local persistence, composer, notifications, models and recent-session records retain compact contracts.
Shared UI owns search fields, scrolling, Markdown and previews; `composer/model.ts` connects previews without
changing drafts. `/export` uses the public complete-transcript API outside the visible history limit.
Local Effect schemas derive desktop preload types; transport stays lazy. `session/session-ownership.ts` guards
submission, revert, queue and request adapters across activations; endpoints and mutation policies stay local.
`composer/prompt.ts` owns mention-range validation for drafts, historical messages and queue undo, preserving each
source's recovery policy. The model picker keeps its active compact tooltip layout.
`QuestionPrompt` and `PermissionPrompt` live in this checkout's `src/session/requests/` and are not shared with
the main app. Their dock adapters map form fields and supply compact copy; routing, response ownership and
web-search setup also stay local. Only the prompt shell and styles come from `session-ui`.
Package-local component tests exercise these widgets with `bun run test:components`.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- One disposable root/data instance and SSE stream per activation, cancellation and snapshot guards. Start at 36
  records; follow nonempty cursors to nine user/shell roots or end, excluding queued prompts. Hydrate missing
  messages; retain live rows/HTTP receipts until acknowledged.
- Draft/history formats, inline URLs, comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo rejects hidden/malformed context and cancels before merging the latest draft.
- Scroll pause/resume; source model defaults, visibility and scoped choices; lazy, retryable OAuth reads; review lifecycle,
  three context lines, bounded patches and 100 ms file-event coalescing.

## Workspace files

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store}.*` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. One replaceable preview, explicit refresh, no file watcher or route-owned tabs. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |

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
