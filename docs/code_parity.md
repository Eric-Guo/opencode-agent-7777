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

Composer conversion, edits and offsets live in `composer/{prompt,prompt-parts}.ts`. Draft restoration, DOM parsing
and history share one text/mention builder; DOM clipboard and caret behavior stay in `composer/editor/dom.ts`.
Editor DOM synchronization follows `composer/editor/{dom,machine}.ts`: matching text and mentions retain their
nodes during attachment-only updates, preserving the caret and native undo/redo. In-place store edits remain
reactive; local blank-line echoes and later explicit clears are separate transitions. Compact mention metadata
refreshes without replacing matching nodes. The rendered contract lives in `component-tests/composer.spec.ts`.
The README documents the local runtime/cache, desktop schemas, request widgets, context details and dialog lifecycle.
`QuestionPrompt` and `PermissionPrompt` stay package-local; only their shell and styles come from `session-ui`.
Question requests follow `session/requests/question-{state,keys}.ts`: request-owned answer transitions and DOM-free
keyboard decisions are separate from rendering. The compact state controller replaces parallel answer arrays and
repeated custom-answer/navigation logic; fresh requests, payloads, focus and keyboard behavior are preserved.
Composer catalog projection stays in `composer/suggestions/catalog-compact.ts`: local/server commands share
one row builder, and context/file mentions are independent of runtime wiring. Attachment IDs reuse public
`@opencode/util/uuid`, including insecure-origin handling, instead of a duplicate compact helper.
Suggestion and recent-session popups reuse public `@opencode/ui/menu-scroll`, following the main app's
menu-scroll boundary. Local adapters retain height limits, viewport padding, keyboard reveal and search behavior.
The composer editor keeps native scrolling; the timeline retains `ScrollView` for its custom thumb and keyboard navigation.
The compact composer catalog adapter reads live shared location catalogs. Owned Solid resources track each read,
replacing its status store and generation counter. Source changes and cleanup retire previous observations without
cancelling another consumer's shared request. Independent failures, retries and cache updates remain available;
render-time status reads never suspend the composer. Loading ownership remains local without a workspace provider.
Composer suggestions and the recent-session picker use shared `createTypeahead`. The composer supplies only
selectable rows and retains its compact shortcut mapping, IME handling, query resets, focus and draft effects.
Its local suggestion machine no longer duplicates active-row state or wrapping; rendered keyboard, catalog-refresh
and command-menu contracts live in `component-tests/composer.spec.ts`.
The model picker uses public `@opencode/ui/search-list` for provider sections, combobox navigation and scrolling,
matching the main app's desktop picker. Its non-modal `@opencode/ui/popover` keeps the compact layout and focus
behavior. **Manage models** is a separate, source-controlled button below the results. Arrow keys select only model
rows. The picker reads the integration catalog only when open with an OpenAI model selected. A Solid resource
tracks refreshes and discards superseded results.
The language adapter reuses the public UI template formatter and parameter type for ordinary, plural and synchronous
translations. `runtime/i18n/language.tsx` also owns `UiI18nBridge`, following the main app's language boundary;
`app.tsx` only composes providers. Compact locale detection, storage and eager English/Chinese dictionaries stay local.
File-mention search follows the main app's separate file-lifecycle machine pattern with local
`workspaces/files/search-machine.ts`. It owns request attempts and status transitions; `model.tsx` drives HTTP reads
and cancellation through public `@opencode/util/abort`. Replaced or cleared requests cannot publish paths or change
the current status. Query limits, deduplication, error recovery and the existing reactive status API are preserved.
Recent-session loading follows `home/sessions/{index,queries,load-machine}.ts`: cursor retrieval stays in the index,
the local query driver owns HTTP cancellation and debounce timers, and a pure machine owns results, cursors and
request attempts. This replaces parallel loading/error flags and a generation counter while preserving server-side
search, 12-row paging, exact-ID lookup and retry behavior. No shared query cache or app source dependency is added.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- The runtime/cache lifecycle documented in README: nine-dialog hydration, snapshot retention and receipt acknowledgement.
- Persisted formats, inline URLs, comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo preserves unrepresentable context and merges the latest draft only after cancellation.
  Question state stays local without the main app's global draft cache, collapse controls or global shortcuts.
- Scroll pause/resume; source model defaults, visibility and scoped choices; review lifecycle,
  three context lines, bounded patches and 100 ms file-event coalescing.

## Meeting features

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,tab,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store,path,watcher}.*`, `shell/state/session-tabs.ts` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. A rounded, resizable left panel with a PLM-specific width preference. File tabs follow the main app's preview/open/close state boundary: single-click previews are replaceable, double-click or Keep open retains a file, and closing selects a neighbor or the conversation. Tabs live in memory for the active workspace/server; no routed persistence or drag reordering. Only the selected file is read and rendered, with workspace-filtered watcher updates through the existing event stream. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |
| Recorder | `session/header/recorder-control.tsx` | Controls process-wide recording and submits stopped MP3 recordings for transcription. |

## Requires a product decision

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
