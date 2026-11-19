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
| `@opencode/gui-plugins` | Display-only context ring |
| `@opencode/ui`, `@opencode/util` | Controls, typeahead navigation, tooltips, image previews, touch visibility, scrolling, i18n, paths and titles |

Timeline charts use the public `MarkdownCodeBlocks` API from `@opencode/session-ui/context/markdown`.
Shared Markdown owns fence completion, source copying and block disposal. The 7777 renderer handles ECharts
options, chart controls and resizing in timeline text parts. Its former timeline-wide DOM observer is removed.
The local `session/timeline/projection.ts` supplies stable message and content objects to the public
`SessionTimeline`, which owns row projection. A text delta updates Chinese-parenthesized URL formatting
for the affected assistant text part while preserving the source text.

Composer conversion, edits and offsets live in `composer/{prompt,prompt-parts}.ts`. Draft restoration, DOM parsing
and history share one text/mention builder; DOM clipboard and caret behavior stay in `composer/editor/dom.ts`.
Editor DOM synchronization follows `composer/editor/{dom,machine}.ts`: matching text and mentions retain their
nodes during attachment-only updates, preserving the caret and native undo/redo. In-place store edits remain
reactive; local blank-line echoes and later explicit clears are separate transitions. Compact mention metadata
refreshes without replacing matching nodes. The rendered contract lives in `component-tests/composer.spec.ts`.
The shared `createAutoScroll` hook owns timeline pinning on content and viewport resize. The local interaction adapter uses `session/timeline/machine.ts` to
distinguish an initial layout adjustment from reader input and tracks jump-button visibility while paused.
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
Mention search follows local `composer/editor/mention-search-machine.ts` and `interaction.ts`, matching the main
app's machine/driver boundary without session search. File reads debounce for 150 ms and have a ten-second deadline
covering decoding. Query, menu, draft/session and server/directory/data-source changes cancel prior work; closing
and reopening the same query starts fresh. Attempt and owner checks reject late responses. The shared filtered
list receives synchronous rows, so skills, agents and recent entries filter immediately while stale file results
stay hidden. Failures retain local rows and the existing empty-list error copy. The retained browser fixture forwards caller
cancellation; the obsolete OpenCode file adapter remains removed, and Nexus production does not enable file mentions.
Composer mode and history recall follow local `composer/suggestions/machine.ts` and
`composer/editor/interaction.ts` boundaries. The persisted draft is the sole mode owner. Pure transitions own
idle/browsing history, entry selection and restoration; one immutable signal snapshot replaces store merges.
The driver retains DOM checks, metadata, cloning and caret placement. Compact history remains separate from
popovers and permits continued browsing after an edit. Session and draft-scope changes retire recall, including
same-session replacements without attachment configuration. Commands, history, model dismissal and attachments
share one cancellable focus frame with editor/session/scope checks; typing and disposal retire pending callbacks.
Existing shortcuts, attachment restoration, shell gates and persisted formats are preserved.
The model picker reads the integration catalog only when open with an OpenAI model selected. A Solid resource
tracks refreshes and discards superseded results.
The language adapter reuses the public UI template formatter and parameter type for ordinary, plural and synchronous
translations. `runtime/i18n/language.tsx` also owns `UiI18nBridge`, following the main app's language boundary;
`app.tsx` only composes providers. Compact locale detection, storage and eager English/Chinese dictionaries stay local.

Recent-session loading follows `home/sessions/{index,queries,load-machine,search-machine}.ts` and the main app's 30-second deadline.
The search machine filters Nexus pages by title or ID and deduplicates results. The loader enforces one deadline per visible page.
The query driver owns search debounce and cancellation. The load machine keeps the query, visible rows and cursor
for **Retry**, and rejects late responses after a timeout, close or query replacement.

Attachment preparation follows local `composer/attachments/{preparation-machine,preparation}.ts`, using the main
app's upload machine/driver separation without adopting server uploads or a global upload service. Picker, paste,
drop and input gestures capture draft ownership before work begins. Reset/restoration, navigation and disposal
retire pending reads; completed files and ordinary edits retain the existing compact draft rules. A 60-second
inactivity deadline begins after selection and renews after each processed file. Send and alternate delivery wait
for all preparation, with a public `Loader` and cancellation control; typing and Stop remain available. Native
picker tokens are released once, even for late selections, and cleanup does not block sending. Inline formats,
filtering, duplicate detection, RPC schemas and persistence stay local and unchanged. Tests cover stale results,
partial failures, cancellation, timeout/retry, send admission, caret preservation and native undo/redo.

Animated presence follows local `runtime/{presence-machine,presence,animated-presence}.ts`, matching the main
app's machine/driver boundary. Visibility, retained values and minimum-duration attempts are pure transitions;
DOM listeners, reduced-motion observation and timers stay in the driver. CSS animation and transition exits have
computed deadlines with 50 ms grace, including a 250 ms base for animations with no duration. Reappearance,
identity/element changes and disposal retire old exits. Existing component styles and accessor contracts remain.
The compact-only `shell/commands/menu-dismiss{,-machine}.ts` retains attachment-menu close ownership:
detach, retain the existing two-frame focus delay, then act once, with a 600 ms deadline.
Gesture-time captures prevent late attachment completion from acquiring a newer opening. Reopening, draft/session
replacement and disposal cancel stale callbacks. The obsolete OpenCode model picker remains removed.
Native/browser pickers open and the Add menu closes in the selection gesture, so an immediate keyboard reopen
starts a fresh opening. These implementations use existing public UI motion and control APIs, with no
parent-package edits, app-source imports or new shared exports.

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

Attachment menu focus validation (2026-11-18). The original menu closed on a timer and dropped an immediate Arrow
Down reopen. Closing in the picker gesture restored keyboard reopening and preserved menu focus after a late read.
The regression passed five focused runs and the full 51-test component suite passed. The live app and backend stayed
running. Evidence is in ignored `node_modules/.cache/attachment-menu-focus/`.

Mention-search validation (2026-11-17): 670 Bun tests, typecheck, the production build and all 51 component tests
passed. New regressions failed against the original code for delayed local filtering and caller cancellation.
Machine/driver coverage checks debounce replacement, all completion paths, owner/source changes, same-query
reopening, ignored aborts and cleanup. Browser fixtures cover immediate local rows, stale-file exclusion, Escape
cancellation, fresh reopening and timeout recovery with retained draft/focus. Live Playwright against the existing
dev server verified skill/file completion, Escape, same-query search and session switching, retaining `1/9`, with
no page errors, failed API responses or API writes. An initial `README` search returned no matches; a `.` search
returned one file and completed successfully. IAB selection timed out; neither app nor backend was restarted.
Logs, baseline failures, browser screenshots and live results are in ignored `node_modules/.cache/mention-parity/`.

Presence/menu lifecycle validation (2026-11-16): 663 Bun tests, typecheck, the production build and all 48 component
tests passed. Isolated original-driver checks reproduced an exit stuck in `hiding` without its completion event
and a deferred model selection committing after the picker reopened. Machine/driver coverage checks deadlines,
stale attempts, owner changes, cancellation and disposal. Browser fixtures cover the existing CSS dropzone exit,
reduced motion, picker ownership changes and synchronous file-chooser admission; a delayed file completion retains
a reopened attachment menu's focus. Live IAB model search/navigation, Escape focus return and attachment-menu
dismissal passed with no page errors, retaining the original conversation and `1/9`. IAB needed one page refresh
after hot reload; neither app nor backend process was restarted. Evidence is in ignored
`node_modules/.cache/lifecycle-parity/` artifacts.

Composer ownership validation (2026-11-16): 640 Bun tests, typecheck, the production build and all 43 component
tests passed. Isolated focus regressions fail against the original controller and pass against the refactor.
Browser fixtures cover edited history recall, attachment restoration, same-session replacement, switching away and
back, persisted mode and stale focus. Live Playwright checks against the existing dev server passed history recall,
model-picker focus/draft retention, command dismissal and session navigation, returning to `1/9`, with no page
errors, failed API responses or API writes. IAB tab selection timed out twice. Neither app nor backend was restarted.
Logs, the isolated baseline loader and screenshots are in ignored `node_modules/.cache/composer-parity/` artifacts.

Attachment lifecycle validation (2026-11-15): 627 Bun tests, typecheck, the browser-enabled production build and
all 40 component tests passed. An isolated late-read regression failed against the original attachment controller
and passed against the refactor. Three-run production medians before/after were 169/162 ms for entry, 58/57 ms for
session switching and 173/173 ms for streaming; the final run also passed UI and runtime timeout/Retry checks.
One intervening UI verification run timed out waiting for a skill suggestion. A diagnostic run confirmed successful
catalog responses, and both diagnostic and unmodified reruns passed without production changes.
IAB access timed out. Live Playwright checks against the existing dev server verified the preparation indicator,
send blocking, cancel focus, ignored late reads, a fresh attachment, model-picker dismissal and draft cleanup,
with no page errors or API writes. Neither app nor backend was restarted. Logs, benchmark JSON and screenshots
are in ignored `node_modules/.cache/attachment-lifecycle/` artifacts.

For session/timeline changes, compare production benchmarks:

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
```

Optional checks: `BENCH_VERIFY_CONTEXT=true`, `BENCH_VERIFY_REVIEW=true` or `BENCH_VERIFY_UI=true`;
overrides: `BENCH_BROWSER`, `BENCH_DIST`, `BENCH_OUTPUT`.
The historical 38 px initial-follow failure also reproduced on unchanged baselines; retain its assertion and
resolve it before claiming a scrolling fix.
