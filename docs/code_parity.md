# Code Layout Parity Review

7777 is an independent Git repository: use local implementations or public shared-package exports, never
`packages/app` or `packages/desktop` source at build or runtime. Preserve existing features and deployment controls.
The [README](../README.md#code-layout-parity-review) owns detailed boundaries and contracts;
[AGENTS.md](../AGENTS.md) owns deployment rules. Earlier audits remain in Git.

## Shared and local boundaries

| Public package | Reused responsibility |
| --- | --- |
| `@opencode/client` | Data, catalogs, APIs and transport types |
| `@opencode/session-ui` | Timeline, attachment/comment cards and line-selection types, `DockPrompt`, `SessionReview` |
| `@opencode/gui-extensions` | `ContextUsage` |
| `@opencode/ui`, `@opencode/util` | Controls, image previews, touch visibility, scrolling, i18n, paths and titles |

Local schema/persistence, composer, notifications, models and recent-session records follow reference boundaries.
Shared UI owns search fields, result scrolling, Markdown and image previews; `composer/model.ts` connects previews
without changing drafts. `/export` uses the public complete-transcript API, independent of the visible history limit.
The desktop bridge derives preload types from local Effect schemas and keeps transport lazy.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- One disposable root/data instance and SSE stream per activation, cancellation and snapshot guards. Start at 36
  records; follow nonempty cursors to nine user/shell roots or end, excluding queued prompts. Hydrate missing
  messages; retain live rows/HTTP receipts until acknowledged.
- Draft/history formats, inline-URL attachment policy, mentions, comments, undo/redo, request routing,
  and suggestion filtering, keyboard selection and compact sizing.
  Queue undo rejects hidden/malformed context, cancels before merging the latest draft, and guards stale activations.
- Scroll pause/resume; source model defaults, visibility and scoped choices; lazy, retryable OAuth reads; review lifecycle,
  three context lines, bounded patches and 100 ms file-event coalescing.

Queue editing/reordering, credentials, staged/history/comment review, docking, terminal, full usage/summary panels,
browser, remote servers and extension hosting require a product decision. Public APIs also lack atomic queue
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
