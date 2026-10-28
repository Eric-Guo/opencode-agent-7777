# Code Layout Parity Review

7777 is an independent Git repository: use local implementations or public shared-package exports, never
`packages/app` or `packages/desktop` source at build or runtime. Preserve existing features and deployment controls.
The [README](../README.md#code-layout-parity-review) owns detailed boundaries and contracts;
[AGENTS.md](../AGENTS.md) owns deployment rules. Earlier audits remain in Git.

## Shared and local boundaries

| Public package | Reused responsibility |
| --- | --- |
| `@opencode/client` | Data, catalogs, APIs, transport types and context-usage selection |
| `@opencode/session-ui` | Timeline, attachment/comment cards, line-selection types, `DockPrompt`, `SessionReview`, context viewers |
| `@opencode/ui`, `@opencode/util` | Controls, context ring/tooltip, image previews, touch visibility, scrolling, i18n, paths and titles |

Composer conversion, edits and offsets live in `composer/{prompt,prompt-parts}.ts`. Draft restoration, DOM parsing
and history share one text/mention builder; DOM clipboard and caret behavior stay in `composer/editor/dom.ts`.
The README documents the local runtime/cache, desktop schemas, request widgets, context details and dialog lifecycle.
`QuestionPrompt` and `PermissionPrompt` stay package-local; only their shell and styles come from `session-ui`.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- The runtime/cache lifecycle documented in README: nine-dialog hydration, snapshot retention and receipt acknowledgement.
- Persisted formats, inline URLs, comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo preserves unrepresentable context and merges the latest draft only after cancellation.
- Scroll pause/resume; source model defaults, visibility and scoped choices; lazy, retryable OAuth reads; review lifecycle,
  three context lines, bounded patches and 100 ms file-event coalescing.

Queue editing/reordering, credentials, staged/history/comment review, docking, terminal, summary panels,
browser, remote servers and extension hosting require a product decision. Public APIs also lack atomic queue
reordering, staged-only/end-revision diffs and GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck`, `bun run build`, and browser interactions without restarting app/server.
Request widgets also use `bun run test:components`. Keep evidence in ignored `node_modules/.cache/`.
For session/timeline changes, compare production benchmarks:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
```

Optional checks: `BENCH_VERIFY_CONTEXT=true`, `BENCH_VERIFY_REVIEW=true` or `BENCH_VERIFY_UI=true`;
overrides: `BENCH_BROWSER`, `BENCH_DIST`, `BENCH_OUTPUT`.
The historical 38 px initial-follow failure also reproduced on unchanged baselines; retain its assertion and
resolve it before claiming a scrolling fix.
