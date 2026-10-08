# Code Layout Parity Review

7777 is an independent Git repository. Runtime, build configuration and assets must not depend on `packages/app`
or `packages/desktop`. Reuse public OpenCode exports such as `@opencode/session-ui`, `@opencode/gui-extensions`,
`@opencode/client`, `@opencode/ui` and `@opencode/util`. Matching upstream filenames does not imply source imports.

Refactor without changing features; ask before adding or removing behavior. The
[README](../README.md#code-layout-parity-review) describes intentional compact differences. Earlier audits and
measurements remain in Git. Local ownership below is not outstanding parity work.

## Ownership

Paths are relative to `src/`.

| Area | Public reuse | Local ownership |
| --- | --- | --- |
| Timeline/scrolling | Session UI timeline, document, actions, markdown/cards; UI scroll primitives | `session/timeline/`, `session/screen.tsx`: nine dialogs, Thinking, restoration and reading intent |
| Runtime | Client `createData`, location resources and promise APIs | `runtime/server/`: activation, hydration, overlays, snapshot races and one SSE stream |
| Models/providers | Client catalog types/resources; UI controls | `providers/{catalog,models}/`: defaults, visibility, grouping, variants, OAuth footer and manager gate |
| Composer/files | Session UI cards; utility path encoding | `composer/`, `workspaces/files/`: editing, drafts/history, serialization and search; `runtime/platform/file-picker.ts`: compact attachment policy |
| Requests/queue | Shared dock controls; client/schema types | `session/requests/`, `session/composer/`, `session/revert.ts`: discovery, replies, queue/steer and undo/redo |
| Recent sessions | Promise client; utility title fallback | `home/sessions/`, `session/title.ts`: directory search, 12-session pages and agent fallback |
| Settings/embedding | UI/i18n primitives | `runtime/{persistence,platform}/`, `settings/`, `new-session/`: storage, bridge, welcome and title policy |
| Usage/review | GUI extension `ContextUsage`; Session UI `SessionReview` | `session/header/session-context-usage-compact.tsx`, `review/`: adapters and lazy dialog; review model/panel/parts follow GUI extension boundaries |

## Refactor constraints

- Preserve nine dialogs and `current/9`, `SET_DOCUMENT_TITLE = false`, Electron gating, `manageModels`, source model
  defaults/visibility, tab-specific keys, accepted-prompt history, local welcome and package-owned assets.
- Each activation owns one disposable Solid root/data instance, subscriptions and cancellation. History starts with 36
  records and advances nonempty cursors until nine user/shell roots or history end; queued prompts do not count.
  Keep reactive references, skill/selection compatibility, missing-message hydration and live rows/HTTP receipts until acknowledged.
- Preserve historical URIs, mention offsets and comment compatibility. Queue undo rejects hidden context and malformed/
  overlapping mentions, cancels before merging into the latest draft, restores focus and ignores stale activations.
  Undo/redo uses loaded history. Attachment formats, inline bytes and duplicate detection stay intact.
- Preserve keyboard/nested-scroll ownership, draggable scrollbar, selection/wheel/upward-key pause, anchoring,
  delayed-event guards and late-render/resize handling. Arrival, collapse, Jump to latest and activation can resume following.
- Keep catalog/API IDs separate, Console grouping before search, independent collapse state, full-catalog switches and
  future defaults. The lazy OpenAI active-OAuth footer remains optional, retryable and usable with `manageModels = false`;
  refresh on reconnect/connection events and abort on disposal. Selection/Escape restores composer focus.
- Preserve directory-wide/child requests and notifications. Review stays lazy, directory-scoped, uses three context lines
  and the existing stream, with retry/empty states, 100 ms file-event coalescing and cancellation/stale-result guards.
  Branch includes uncommitted changes from the common ancestor; committed ends at `HEAD`. Compare/Enter applies the base.
  Preserve drafts and bounded-patch limitations.

## Requires a product decision

- Queue editing/reordering: no atomic reorder; recreating entries risks partial failure/concurrent delivery.
- Provider connection and credential management.
- Staged-only review, arbitrary history ranges, comments and extension docking; public VCS lacks staged-only/end-revision modes.
- Terminal, full usage/summary panels, browser, remote servers and extension hosting; public definitions lack the GUI host/contexts.

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
