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
| `@opencode/ui`, `@opencode/util` | Controls, typeahead navigation, context ring/tooltip, image previews, touch visibility, scrolling, i18n, paths and titles |

Timeline charts use the public `MarkdownCodeBlocks` API from `@opencode/session-ui/context/markdown`.
Shared Markdown owns fence completion, source copying and block disposal. The 7777 renderer handles ECharts
options, chart controls and resizing in timeline text parts. Its former timeline-wide DOM observer is removed.

Composer conversion, edits and offsets live in `composer/{prompt,prompt-parts}.ts`. Draft restoration, DOM parsing
and history share one text/mention builder; DOM clipboard and caret behavior stay in `composer/editor/dom.ts`.
Editor DOM synchronization follows `composer/editor/{dom,machine}.ts`: matching text and mentions retain their
nodes during attachment-only updates, preserving the caret and native undo/redo. In-place store edits remain
reactive; local blank-line echoes and later explicit clears are separate transitions. Compact mention metadata
refreshes without replacing matching nodes. The rendered contract lives in `component-tests/composer.spec.ts`.
The shared `createAutoScroll` hook owns timeline pinning on content and viewport resize. The local interaction adapter
distinguishes an initial layout adjustment from reader input and tracks jump-button visibility while paused.
The README documents the local runtime/cache, desktop schemas, request widgets, context details and dialog lifecycle.
`QuestionPrompt` and `PermissionPrompt` stay package-local; only their shell and styles come from `session-ui`.
Question requests follow `session/requests/question-{state,keys}.ts`: request-owned answer transitions and DOM-free
keyboard decisions are separate from rendering. The compact state controller replaces parallel answer arrays and
repeated custom-answer/navigation logic; fresh requests, payloads, focus and keyboard behavior are preserved.
Composer catalog projection stays in `composer/suggestions/catalog-compact.ts`: local/server commands share
one row builder, and context/file mentions are independent of runtime wiring. Attachment IDs reuse public
`@opencode/util/uuid`, including insecure-origin handling, instead of a duplicate compact helper.
Suggestion, model and recent-session popups reuse public `@opencode/ui/menu-scroll`, following the main app's
menu-scroll boundary. Local adapters retain height limits, viewport padding, keyboard reveal and search behavior.
The composer editor keeps native scrolling; the timeline retains `ScrollView` for its custom thumb and keyboard navigation.
The OpenCode composer catalog adapter is removed on `nexus_backend`; composer browser tests supply local suggestion
fixtures without the deleted runtime or catalog modules. Its catalog loading/retry test is removed with the feature.
The retained composer suggestions and recent-session picker use shared `createTypeahead`. The composer supplies only
selectable rows and retains its compact shortcut mapping, IME handling, query resets, focus and draft effects.
Its local suggestion machine no longer duplicates active-row state or wrapping; rendered keyboard, catalog-refresh
and command-menu contracts live in `component-tests/composer.spec.ts`.
The model picker reads the integration catalog only when open with an OpenAI model selected. A Solid resource
tracks refreshes and discards superseded results.
The language adapter reuses the public UI template formatter and parameter type for ordinary, plural and synchronous
translations. `runtime/i18n/language.tsx` also owns `UiI18nBridge`, following the main app's language boundary;
`app.tsx` only composes providers. Compact locale detection, storage and eager English/Chinese dictionaries stay local.

Recent-session loading follows `home/sessions/{index,queries,load-machine}.ts`: the index retrieves Nexus
conversation pages and filters titles, IDs and duplicates; the query driver owns cancellation and search debounce
timers; the pure machine owns results, cursors, request attempts and loading/error transitions. Closing or replacing
a query invalidates late responses, including reopening the same query. No shared query cache or app source dependency
is added.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- The runtime/cache lifecycle documented in README: nine-dialog hydration, snapshot retention and receipt acknowledgement.
- Persisted formats, inline URLs, comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo preserves unrepresentable context and merges the latest draft only after cancellation.
  Question state stays local without the main app's global draft cache, collapse controls or global shortcuts.
- Scroll pause/resume; source model defaults, visibility and scoped choices; review lifecycle,
  three context lines, bounded patches and 100 ms file-event coalescing.

Queue editing/reordering, credentials, staged/history/comment review, docking, terminal, summary panels,
browser, remote servers and extension hosting require a product decision. Public APIs also lack atomic queue
reordering, staged-only/end-revision diffs and GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck`, `bun run build`, and browser interactions without restarting app/server.
Request widgets, pickers and the composer also use `bun run test:components`. Keep evidence in ignored `node_modules/.cache/`.
For session/timeline changes, compare production benchmarks:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
```

Optional checks: `BENCH_VERIFY_CONTEXT=true`, `BENCH_VERIFY_REVIEW=true` or `BENCH_VERIFY_UI=true`;
overrides: `BENCH_BROWSER`, `BENCH_DIST`, `BENCH_OUTPUT`.
The historical 38 px initial-follow failure also reproduced on unchanged baselines; retain its assertion and
resolve it before claiming a scrolling fix.
