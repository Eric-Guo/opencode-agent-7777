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

Composer conversion and part edits are centralized in `composer/{prompt,prompt-parts}.ts`; clipboard insertion and
caret handling belong to `composer/editor/dom.ts`. UI adapters retain routing, persistence and recovery policies.
Shared UI owns fields, scrolling, Markdown and previews; `/export` reads the complete transcript through the client.
Local schemas type the lazy desktop transport. `session/session-ownership.ts` binds mutations and refreshes to the
captured runtime; its data adapter composes the message cache and pending receipts without global cache forwarding.
`QuestionPrompt` and `PermissionPrompt` live in this checkout's `src/session/requests/` and are not shared with
the main app. Their dock adapters map form fields and supply compact copy; routing, response ownership and
web-search setup also stay local. Only the prompt shell and styles come from `session-ui`.
Package-local component tests exercise these widgets with `bun run test:components`.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- The runtime/cache lifecycle documented in README: nine-dialog hydration, snapshot retention and receipt acknowledgement.
- Draft/history formats, inline URLs, comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo rejects hidden/malformed context and cancels before merging the latest draft.
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
