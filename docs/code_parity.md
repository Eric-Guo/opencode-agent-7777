# Code Layout Parity Review

7777 is an independent Git repository. Keep source, build and assets independent of `packages/app` and
`packages/desktop`; reuse public OpenCode package exports. Refactor without changing features; ask before adding
or removing behavior. The [README](../README.md#code-layout-parity-review) explains intentional compact differences.
Local ownership below is not unfinished parity work; earlier audits remain in Git.

## Ownership

Paths are relative to `src/`.

| Area | Public reuse | Local ownership |
| --- | --- | --- |
| Timeline | Session UI rendering; UI scrolling | `session/{timeline,screen.tsx}`: nine dialogs, Thinking, restoration |
| Runtime | Client `createData`, resources/APIs | `runtime/server/`: activation, hydration, overlays, snapshot races, SSE |
| Models | Client catalogs/capabilities; UI controls | `providers/`: IDs, defaults, visibility, grouping, costs, variants, OAuth footer |
| Composer/files | Session UI cards; utility paths | `composer/`, `workspaces/files/`, `runtime/platform/file-picker.ts`: drafts/history, editing, search, attachments |
| Requests/queue | Shared docks; client/schema types | `session/{requests,composer,revert.ts}`: discovery, replies, queue/steer, undo/redo |
| Recent sessions | Client; utility title fallback | `home/sessions/`, `session/title.ts`: directory search, 12-session pages, agent fallback |
| Embedding | UI/i18n | `runtime/{persistence,platform}/`, `settings/`, `new-session/`: storage, bridge, welcome, title |
| Usage/review | GUI `ContextUsage`; Session UI `SessionReview` | `session/header/session-context-usage-compact.tsx`, `review/`: adapters, lazy dialog |

## Refactor constraints

- Keep `current/9`, `SET_DOCUMENT_TITLE = false`, Electron gating, `manageModels`, source defaults/visibility,
  tab-specific keys, accepted-prompt history, local welcome and assets.
- Each activation owns one disposable Solid root/data instance and SSE stream. Preserve cancellation, reactive references,
  compatibility and snapshot guards. Start history at 36 records; follow nonempty cursors to nine user/shell roots or end,
  excluding queued prompts. Hydrate missing messages; retain live rows/HTTP receipts until acknowledged.
- Preserve URIs, mentions, comments, attachment formats/bytes/deduplication and loaded-history undo/redo. Queue undo rejects
  hidden/malformed context, cancels before merging the latest draft, restores focus and ignores stale activations.
- Preserve scroll ownership, scrollbar, reading/selection pauses, anchoring, delayed-event/resize guards and resume triggers.
- Keep catalog/API IDs separate, capability arrays isolated, tooltip order, costs and variants. Preserve Console grouping,
  search/collapse state, full-catalog switches/future defaults and focus restoration. OAuth reads stay optional/retryable,
  lazy, event-refreshed and cancellable, including with `manageModels = false`.
- Keep directory/child requests and notifications. Review preserves drafts, three context lines, retry/empty states,
  existing-stream refresh, 100 ms file-event coalescing and stale-result guards. Branch includes uncommitted changes from
  the common ancestor; committed ends at `HEAD`. Compare/Enter applies the base; bounded-patch limitations remain.

## Requires a product decision

Queue editing/reordering, provider credentials, staged/history/comment review, extension docking, terminal,
full usage/summary panels, browser, remote servers and extension hosting require approval. Public APIs lack atomic queue
reordering, staged-only/end-revision diffs and the GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck` and `bun run build` here. Re-check the running development page after interactions
without restarting the app/server. Keep logs/screenshots in ignored `node_modules/.cache/`.

For session/timeline changes, compare production benchmarks before and after:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
# Optional extended checks:
BENCH_VERIFY_REVIEW=true bun run bench:runtime
BENCH_VERIFY_UI=true bun run bench:runtime
```

The fixture uses Playwright Chromium; `BENCH_BROWSER`, `BENCH_DIST` and `BENCH_OUTPUT` override its executable, bundle
and results path. The historical 38 px initial-follow failure reproduced on changed and unchanged baselines;
retain the assertion and do not claim a scrolling fix without resolving it.
