# Code Layout Parity Review

Refactor without feature changes or source/build/runtime dependencies on `packages/app` or `packages/desktop`.
Reuse public shared exports below. The [README](../README.md#code-layout-parity-review) maps local boundaries,
including consolidated prompt payloads and request-response lifecycles; earlier audits remain in Git.

| Package | Shared responsibility |
| --- | --- |
| `@opencode/client` | `createData`, catalogs, APIs, prompt fields and queue/steer types |
| `@opencode/session-ui` | Timeline, attachment/comment cards, `DockPrompt`, `SessionReview` |
| `@opencode/gui-extensions` | `ContextUsage` |
| `@opencode/ui`, `@opencode/util` | Controls, scrolling, i18n, paths and title fallback |

## Refactor constraints

- Keep `current/9`, `SET_DOCUMENT_TITLE = false`, Electron gating, `manageModels`, source defaults/visibility,
  tab-specific keys, accepted-prompt history, Thinking, welcome and local assets. Recent sessions retain directory
  search, 12-session pages and the agent title fallback.
- One disposable Solid root/data instance and SSE stream per activation; preserve cancellation, reactivity,
  compatibility and snapshot guards. Start at 36 records; follow nonempty cursors to nine user/shell roots or end,
  excluding queued prompts. Hydrate missing messages; retain live rows/HTTP receipts until acknowledged.
- Preserve URIs, mentions, comments, attachment formats/bytes/deduplication and loaded-history undo/redo. Queue undo
  rejects hidden/malformed context, cancels before merging the latest draft, restores focus and ignores stale activations.
- Preserve scroll ownership, scrollbar, reading/selection pauses, anchoring, delayed-event/resize guards and resume triggers.
- Keep separate catalog/API IDs, isolated capability arrays, tooltip order, costs, variants, Console grouping,
  search/collapse state, full-catalog switches/future defaults and focus restoration. OAuth reads remain optional,
  retryable, lazy, event-refreshed and cancellable, including with `manageModels = false`.
- Keep directory/child requests, notifications and activation/pending-reply guards. Review preserves drafts, three
  context lines, retry/empty states, existing-stream refresh, 100 ms file-event coalescing and stale-result guards.
  Branch includes uncommitted changes from the common ancestor; committed ends at `HEAD`. Compare/Enter applies the
  base; bounded-patch limitations remain.

Ask before adding queue editing/reordering, provider credentials, staged/history/comment review, extension docking,
terminal, full usage/summary panels, browser, remote servers or extension hosting. Public APIs lack atomic queue
reordering, staged-only/end-revision diffs and GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck`, `bun run build`, and re-check browser interactions without restarting app/server.
Keep logs/screenshots in ignored `node_modules/.cache/`. For session/timeline changes, compare production benchmarks:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
# Optional extended checks:
BENCH_VERIFY_REVIEW=true bun run bench:runtime
BENCH_VERIFY_UI=true bun run bench:runtime
```

The fixture uses Playwright Chromium; override executable/bundle/results with `BENCH_BROWSER`/`BENCH_DIST`/`BENCH_OUTPUT`.
The historical 38 px initial-follow failure also reproduced on unchanged baselines; retain its assertion and resolve
it before claiming a scrolling fix.
