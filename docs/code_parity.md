# Code Layout Parity Review

7777 is an independent Git repository: use local implementations or public shared-package exports, never
`packages/app` or `packages/desktop` source at build or runtime. Preserve existing features and deployment controls.
The [README](../README.md#code-layout-parity-review) owns detailed boundaries and contracts;
[AGENTS.md](../AGENTS.md) owns deployment rules. Earlier audits remain in Git.

## Shared and local boundaries

| Public package                   | Reused responsibility                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@opencode/client`               | Data, catalogs, APIs, transport types and context-usage selection                                                         |
| `@opencode/session-ui`           | Timeline, attachment/comment cards, line-selection types, `DockPrompt`, `SessionReview`, context viewers                  |
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
Web-search consent follows `session/requests/{websearch,websearch-machine}.ts`. A local state machine tracks
the choice and provider replies across HTTP, events and pending-form reads. The compact request model owns
child-session routing and shared-client access. The compact dock retains its existing controls and asks for
confirmation when a selected provider disappears. Browser coverage lives in `component-tests/websearch.spec.ts`.
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
Review follows the plugin's `review/{machine,model}.ts` boundary locally. Each turn or VCS diff read has a
30-second deadline. The dialog offers Retry for the selected comparison if the server stalls, and ignores late
results after a timeout, source change or close. The model still uses the existing activation and event stream.
Queue actions and history undo/redo now follow local `session/composer/queue-machine.ts` and
`session/revert-machine.ts` boundaries. Their drivers own requests and subscriptions; one immutable signal snapshot
owns each lifecycle and attempt. Switching or reactivating a session settles the old caller and releases its UI
ownership. Queue Undo requires HTTP success or an explicit cancellation event before merging the latest draft;
delivery and missing rows cannot restore it. Queue writes keep the existing transport deadline. History actions have
a 30-second bound; confirmed boundaries and restored drafts survive stalled or failed history refreshes, whose
shared loading state remains independently owned. Uncertain outcomes trigger existing reads, without write retries.
JSON export follows local `session/commands/{export-machine,export-session}` boundaries. The exporter keeps
its original target across navigation and serializes requests. A 60-second deadline covers fetch and decoding;
timeout or disposal dismisses loading, aborts the read and rejects late downloads. Notifications follow the active
language provider. Synchronous disposal prevents unsent requests and suppresses remaining completion effects.
No shared exports or app-source dependencies are added. Machine tests and the existing queue/revert/transfer suites
cover these contracts alongside the local export-driver suite.

Transport scheduling follows local `runtime/server/{request-queue-machine,request-queue}.ts` boundaries.
The pure machine owns slots, FIFO eligibility, request IDs and stall warnings; the driver retains fetch, abort signals,
promise callbacks and timers. The shared fetch/origin budget, synchronous free-slot dispatch, slow-request limits,
event-stream bypass, header deadlines and response-body cancellation remain unchanged. Compact FIFO scheduling and
transport lifetime stay local; the main app's priorities and disposal API are not adopted. Machine and transport tests
cover stale completions, watcher cleanup, cancellation between grant and dispatch, and synchronous fetch failures.

Startup, runtime attachment, activation reads, session switching and New session admission now use the local
`runtime/server/load-machine.ts` finite-read boundary. It replaces independent generation counters and busy
flags while leaving the main app's multi-server registry and workspace providers outside the compact runtime.
Stream activity/EOF ownership follows `server-sync-machine.ts`; hydration scheduling, loading and coalescing
follow `refresh-machine.ts`. Controllers, timers and caller settlement remain in drivers; immutable machine
snapshots never enter mutable Solid stores.

Complete API reads, including decoding, are bounded through local `operation.ts` and `read-client.ts` beneath
shared `createData`, so stalled synchronization entries settle and retries can proceed. Shared reads retain data-owner
cancellation; an individual observer cannot abort another consumer's catalog work. Startup, activation, catalogs
and hydration passes have 60-second deadlines. The error banner offers localized Retry without restoring over
an edited draft. Non-AI session loading uses the public `Loader`.

Submission follows local `composer/{machine,submit}.ts`: synchronous admission and captured targets, with separate
60-second creation/configuration/admission bounds. Matching SSE admission can confirm success before HTTP;
history records once and retired responses cannot overwrite newer drafts. Existing-session sends retain their
original target after navigation, while departed drafts reject promotion. Interrupt retains `resume: true` and a
60-second deadline. Uncertain outcomes reconcile through reads without automatic write retries.
Model choices follow `providers/models/selection-machine.ts`; persistence is an output effect. A ten-second
acknowledgement deadline retains local preferences, and older cancellation or acknowledgement cannot retire a
newer choice. Optional agent-catalog stalls do not disable successfully loaded models.

Permission/question replies and directory lists use compact-local `session/requests/{reply-machine,list-machine}.ts`.
Replies have 15/30-second deadlines respectively. List reads cannot release active replies; SSE-created requests
survive older snapshots, and settled IDs cannot be resurrected. Attempt IDs reject older HTTP completion after an
SSE acknowledgement and a subsequent reply. Child routing, notification delivery, answer state and web-search
behavior retain their existing owners. No app-source imports, parent edits or shared-package exports are added.

## Remaining compact responsibilities

- Embedding controls, `current/9`, model configuration, tab keys, welcome, local assets and paged recent-session search.
- The runtime/cache lifecycle documented in README: nine-dialog hydration, snapshot retention and receipt acknowledgement.
- Persisted formats, inline URLs, comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo preserves unrepresentable context and merges the latest draft only after cancellation.
  Question state stays local without the main app's global draft cache, collapse controls or global shortcuts.
- Scroll pause/resume; source model defaults, visibility and scoped choices; review event routing,
  three context lines, bounded patches and 100 ms file-event coalescing.

## Workspace files

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store}.*` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. One replaceable preview, explicit refresh, no file watcher or route-owned tabs. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |

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

Transport refactor validation (2026-11-14): 601 Bun tests, typecheck and the browser-enabled production build passed.
Three-run benchmark medians before/after were 162/163 ms for entry, 63/67 ms for session switching and 172/174 ms
for streaming. The after run also passed `BENCH_VERIFY_REVIEW=true`, including timeout and retry checks.
Live Playwright verification against the existing dev server passed model-picker loading, recent-session navigation
and review reads with no page errors. IAB automation timed out; neither the app nor the backend was restarted.
Logs, benchmark JSON and screenshots are kept in ignored `node_modules/.cache/request-queue-*` artifacts.

Runtime lifecycle validation (2026-11-14): 616 Bun tests, typecheck, the browser-enabled production build and
all 37 component tests passed. Three-run production medians were 161 ms entry, 62 ms switching and 174 ms
streaming, against the 166/58/173 ms baseline. Review, timeline interaction and runtime timeout/Retry fixture
checks passed, including draft retention and recovery to `9/9`. Live Playwright checks exercised models, recent
sessions and review without page errors or API writes. After browser access was enabled, IAB model search and
Escape dismissal passed on the existing chart/table conversation, retaining `1/9` and composer focus. Neither
app nor backend was restarted. Evidence is in ignored `node_modules/.cache/parity-*` artifacts.

Optional checks: `BENCH_VERIFY_RUNTIME=true`, `BENCH_VERIFY_CONTEXT=true`, `BENCH_VERIFY_REVIEW=true` or `BENCH_VERIFY_UI=true`;
overrides: `BENCH_BROWSER`, `BENCH_DIST`, `BENCH_OUTPUT`.
`BENCH_VERIFY_REVIEW=true` checks that a stalled branch comparison times out and can be retried with the same base.
`BENCH_VERIFY_UI=true` also checks the 38 px initial-follow gap. The fixture briefly enlarges the viewport,
reads its clamped offset and restores its height before the scroll event arrives. It checks following on activation,
after **Jump to latest** and after switching sessions, alongside wheel, keyboard, scrollbar and text-selection behavior.

`BENCH_VERIFY_RUNTIME=true` stalls a production activation read, advances its deadline, and verifies Retry,
retained draft text, successful history recovery and the restored `9/9` counter against the deterministic fixture.

Context focus-return validation (2026-11-14): the existing production context keeper reproduced the command-menu
then ring-open regression before the fix. The compact dialog adapter now accepts an explicit opener and restores
it through the public Dialog close-focus hook, guarded against replacement dialogs and retired runtimes. Command
opens retain shared editor/caret restoration. Context, review, timeline and runtime Retry checks all passed together;
three-run medians were 162 ms entry, 60 ms switching and 175 ms streaming. IAB verified command/Escape return to
the editor, pointer/Escape and keyboard/Close return to the ring, and retention of the unsent draft and `1/9` counter.
The test draft was cleared afterward. The app and backend remained running. Evidence is in ignored
`node_modules/.cache/context-focus-*` artifacts.
