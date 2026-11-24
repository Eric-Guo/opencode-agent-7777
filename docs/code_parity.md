# Code Layout Parity Review

7777 is an independent Git repository: use local implementations or public shared-package exports, never
`packages/app` or `packages/desktop` source at build or runtime. Preserve existing features and deployment controls.
The [README](../README.md#code-layout-parity-review) owns detailed boundaries and contracts;
[AGENTS.md](../AGENTS.md) owns deployment rules. Earlier audits remain in Git.

## Shared and local boundaries

| Public package                   | Reused responsibility                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@opencode/client`               | Data, catalogs, APIs, transport types and context-usage selection                                                         |
| `@opencode/gui-plugins`          | Display-only context-usage ring                                                                                          |
| `@opencode/session-ui`           | Timeline, attachment/comment cards, line-selection types, `DockPrompt`, `SessionReview`, context viewers                  |
| `@opencode/ui`, `@opencode/util` | Controls, typeahead navigation, tooltips, image previews, touch visibility, scrolling, i18n, paths and titles              |

The header uses the public `ContextUsage` indicator from `@opencode/gui-plugins/context/context-usage`.
The compact adapter owns the button, localized cost/context/token tooltip, and dialog focus restoration.

Timeline charts use the public `MarkdownCodeBlocks` API from `@opencode/session-ui/context/markdown`.
Shared Markdown owns fence completion, source copying and block disposal. The 7777 renderer handles ECharts
options, chart controls and resizing in timeline text parts. Its former timeline-wide DOM observer is removed.

The same provider passes workspace image reads and the saved code-wrap preference to shared Markdown. The local
`runtime/server/image.ts` maps decoded paths to the session client's file API using public artifact MIME and
path helpers. Reads retain the active workspace as their server location. The renderer owns image retries,
cancellation, URL disposal and per-block wrap overrides. The language context has a stable module identity so
editing a preference label during development keeps mounted controls connected to their provider.

The local `session/timeline/projection.ts` supplies stable message and content objects to the public
`SessionTimeline`, which owns row projection. Only the assistant text part receiving a delta recomputes its
Chinese-parenthesized URL formatting. The context inspector and export retain the source text.

For user rows, `composer/comment-note.ts` reads prompt metadata into the public `SessionUserPresentation`
type. The shared timeline renders quotes, plugin notes, legacy browser-element comments, and server-file
references alongside inline attachments. A reference card shows its saved path on hover without reading the
file. The compact reader preserves the order of valid entries and the existing file-comment fallbacks.
Draft restoration continues to use the presentation's display text and the original message's files and mentions.

Non-image attachment downloads use the public `SessionUserActions.openAttachment` callback. Shared cards own
pointer and keyboard activation. The compact timeline action downloads the recorded bytes, including empty
files, or reads a just-sent attachment’s local URL while it awaits admission. It shares browser download
cleanup with JSON export and base64 URL parsing with draft persistence.

The compact timeline shows **Changed files** by default through the public `SessionTimeline` and `TurnDiffSource`
APIs. A saved preference takes precedence. Shared rows own the file list, counts, patch disclosure and Retry.
Local `session/timeline/turn-diff-machine.ts` owns load, completion and retry decisions. Its `turn-diffs.ts`
driver requests a finished turn through `session.diff` and caches it by its closing idle marker within
the nine-dialog window. Steered prompts share a read. Reads have three lines of context
and a 15-second deadline. The gear menu and settings persistence stay local.

Message labels and model-switch notices use the active directory’s cached provider and model lists.
`providers/catalog/providers.ts` shares the catalog with the picker, including each model’s speed and
base model. The public timeline renders the localized notice and falls back to the recorded ID while the
catalog loads or when it has no matching entry.

The Timeline menu also persists two independent expansion defaults for shell and edit tool calls. The compact
adapter passes them to the public `SessionTimeline` props `shellToolDefaultOpen` and `editToolDefaultOpen`.
Both start off. The shared timeline owns grouping, patch rendering and per-row disclosure.

Live shell rows use the public session UI provider's `shellRunning` and `shellOutput` callbacks.
The shared row follows output by cursor and reads the final page on exit. The compact runtime adapter
loads the public client’s directory inventory on the first output request and refreshes it on reconnect.
It reconciles shell lifecycle events received during a list read and cancels reads when the session or
directory changes. Completed shells with saved output render without shell API requests.

Composer conversion, edits and offsets live in `composer/{prompt,prompt-parts}.ts`. Draft restoration, DOM parsing
and history share one text/mention builder; DOM clipboard and caret behavior stay in `composer/editor/dom.ts`.
Editor DOM synchronization follows `composer/editor/{dom,machine}.ts`: matching text and mentions retain their
nodes during attachment-only updates, preserving the caret and native undo/redo. In-place store edits remain
reactive; local blank-line echoes and later explicit clears are separate transitions. Compact mention metadata
refreshes without replacing matching nodes. The rendered contract lives in `component-tests/composer.spec.ts`.
Timeline scroll decisions live in the compact `session/timeline/machine.ts`. It distinguishes a layout shift from
reader input and uses consecutive viewport measurements to preserve a pause or recognize arrival near the end.
The local interaction adapter handles DOM events and uses the same ten-pixel boundary for **Jump to latest**.
The public `createAutoScroll` hook owns the pause state and pins on content and viewport resize.
The local `session/timeline/controller-projection.ts` follows the main app's projection boundary. The timeline
and loader use the same revert filter and nine-dialog count. The runtime pages through the public client until the
visible window is full or the cursor stops advancing, and retains staged rows for Redo. A server revert can
schedule a refill through the existing refresh lifecycle. A commit invalidates any in-flight message page and
restarts the read from the latest messages.
The README documents the local runtime/cache, desktop schemas, request widgets, context details and dialog lifecycle.
`QuestionPrompt` and `PermissionPrompt` stay package-local; only their shell and styles come from `session-ui`.
Question requests follow the main app’s `session/requests/question-machine.ts` boundary locally. The pure
machine tracks option picks and custom text independently, preserves their selection order, and constructs
scalar or multiselect replies. The request-owned `question-state.ts` runs focus and reply effects, and
`question-keys.ts` maps compact keyboard shortcuts. Checked options survive edits to matching custom text.
MCP input requests follow the local `session/requests/{elicitation-machine,elicitation-controller}.ts` boundary.
The pure module evaluates conditions against preceding visible answers and checks required fields and selection
counts. The controller retains edits by request identity. The dock uses the public `DockPrompt` shell and form
controls, including native input validation. Session and subagent requests take priority over directory-wide forms.
The compact form adapter routes answers and dismissals to their owner and reconciles pending forms on reconnect.
The production-entry fixture in `component-tests/request-routing.spec.ts` covers routing, typed replies and retry.
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
Mention search follows local `composer/editor/mention-search-machine.ts` and `interaction.ts`, matching the main
app's machine/driver boundary without session search. File reads debounce for 150 ms and have a ten-second deadline
covering decoding. Query, menu, draft/session and server/directory/data-source changes cancel prior work; closing
and reopening the same query starts fresh. Attempt and owner checks reject late responses. The shared filtered
list receives synchronous rows, so skills, agents and recent entries filter immediately while stale file results
stay hidden. Failures retain local rows and the existing empty-list error copy. The local file adapter forwards
caller cancellation and settles abort-ignoring reads, preserving its status API, result limit and deduplication.
Composer mode and history recall follow local `composer/suggestions/machine.ts` and
`composer/editor/interaction.ts` boundaries. The persisted draft is the sole mode owner. Pure transitions own
idle/browsing history, entry selection and restoration; one immutable signal snapshot replaces store merges.
The driver retains DOM checks, metadata, cloning and caret placement. Compact history remains separate from
popovers and permits continued browsing after an edit. Session and draft-scope changes retire recall, including
same-session replacements without attachment configuration. Commands, history, model dismissal and attachments
share one cancellable focus frame with editor/session/scope checks; typing and disposal retire pending callbacks.
Existing shortcuts, attachment restoration, shell gates and persisted formats are preserved.
The model picker uses public `@opencode/ui/search-list` for provider sections, combobox navigation and scrolling,
matching the main app's desktop picker. Its non-modal `@opencode/ui/popover` keeps the compact layout and focus
behavior. **Manage models** is a separate, source-controlled button below the results. Arrow keys select only model
rows. The picker reads the integration catalog only when open with an OpenAI model selected. A Solid resource
tracks refreshes and discards superseded results. Local `session/composer/timeline-actions.ts` supplies the
shared budget notices with the mounted picker's open action when a root session can choose a model.
The language adapter reuses the public UI template formatter and parameter type for ordinary, plural and synchronous
translations. `runtime/i18n/language.tsx` also owns `UiI18nBridge`, following the main app's language boundary;
`app.tsx` only composes providers. Compact locale detection, storage and eager English/Chinese dictionaries stay local.
File-mention search follows the main app's separate file-lifecycle machine pattern with local
`workspaces/files/search-machine.ts`. It owns request attempts and status transitions; `model.tsx` drives HTTP reads
and cancellation through public `@opencode/util/abort`. Replaced or cleared requests cannot publish paths or change
the current status. Query limits, deduplication, error recovery and the existing reactive status API are preserved.
Recent-session search follows the main app's `home/sessions/search-machine.ts` boundary locally. It decides when
to look up an exact ID, merges directory-scoped results and requests enough rows to fill the page. The page loader
runs the title query, exact lookup and cursor backfill under one 30-second deadline. Cancelling a search settles
the caller even if a read ignores abort. The query driver owns debounce and cancellation, and the load machine
retains rows, query and cursor for Retry. The background directory snapshot uses the same loader and the active
runtime or draft's client. Only the latest refresh can publish results or offer a banner retry.
Recent-session rows, exact-ID lookup, session actions and post-delete navigation use `sameDirectory` from
`@opencode/util/path`. The open picker, VCS review and integration catalog use it for directory-scoped events.
Matching handles trailing slashes and Windows drive or UNC spelling while keeping POSIX paths case-sensitive.
Review follows the plugin's `review/{machine,model}.ts` boundary locally. The machine routes reconnects and the
captured session's execution outcomes and reverts to an immediate refresh. File events schedule a refresh only
for a VCS comparison in the same directory. The driver owns the 100 ms trailing timer and the 30-second diff
read deadline. The dialog offers Retry for the selected comparison and ignores late results after a timeout,
source change or close. The dialog subscribes to the existing event stream for its activation.
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

The current root session and recent-session rows share the compact `session/header/session-options.tsx` menu,
following the main app's Rename, Export and Delete actions. The local `session/commands/rename-session.ts` owns
the title write and recent-list refresh. It preserves a newer title if another rename lands during the request.
The local `session/delete-machine.ts` owns delete confirmation and retry. A missing-session response counts as
success only for the selected session and pending attempt. The compact `session/commands/session-actions.tsx`
drives both dialogs through public UI controls. Its shared write helper captures the target and accepts a matching
server event or HTTP success within 15 seconds. Active-session deletion uses the existing navigation and draft
activation paths. The context inspector, session menus and `/export` share a screen-owned exporter. A recent-row
action uses the selected row's session ID.

The public timeline’s **Fork from here** action and the local `/fork` picker share
`session/{fork-machine,fork}.ts`. The picker uses the public `SearchList` and the existing nine-dialog projection.
It searches delivered user messages in memory. The active directory’s command catalog determines whether
`/fork` opens the picker or runs a deployment-defined command. Both fork entry points use the public session
client, share prompt reconstruction with Undo, and protect edits made before or during creation.

The header's **current/9** counter opens **Jump to message**. It shares the local
`session/commands/message-picker.tsx` dialog with `/fork`. Both read delivered user prompts from the
visible history. The local `session/commands/jump-to-message.ts` matches each prompt's display text, inline
and server-reference filenames, quotes, file comments and note labels. It returns the first matching excerpt
per prompt and keeps the original preview for an empty query. Selecting a result focuses and scrolls
the embedded transcript through `session/timeline/interaction.ts`. Search and selection run in memory.

Transport scheduling follows local `runtime/server/{request-queue-machine,request-queue}.ts` boundaries.
The pure machine owns slots, FIFO eligibility, request IDs and stall warnings; the driver retains fetch, abort signals,
promise callbacks and timers. The shared fetch/origin budget, synchronous free-slot dispatch, slow-request limits,
event-stream bypass, header deadlines and response-body cancellation remain unchanged. Compact FIFO scheduling and
transport lifetime stay local; the main app's priorities and disposal API are not adopted. Machine and transport tests
cover stale completions, watcher cleanup, cancellation between grant and dispatch, and synchronous fetch failures.

Startup, runtime attachment, activation reads, session switching and New session admission now use the local
`runtime/server/load-machine.ts` finite-read boundary. It replaces independent generation counters and busy
flags while leaving the main app's multi-server registry and workspace providers outside the compact runtime.
The saved-session lookup in `global-sync/session-load-current.ts` uses the same ID-specific not-found
predicate as session actions. A temporary or mismatched response goes to startup Retry with the tab record
and draft intact. A confirmed deletion opens the saved draft in its directory.
Stream activity, handshake and retry backoff follow the local `server-sync/{connection,machine}.ts` boundary.
The first greeting reconciles both pending request lists with the active directory. Heartbeats renew stream readiness
and the idle deadline. Hydration scheduling, loading and coalescing follow `refresh-machine.ts`. Drivers own
controllers, timers and caller settlement. Machine snapshots live outside mutable Solid stores.

The compact runtime keeps HTTP queue receipts in `runtime/server/global-sync/session-cache-pending.ts`.
It reconciles them with the public client's inbox by ID and by the revision at which a snapshot started.
The message cache uses the same queue edit to hide removed prompts and show readmitted ones. The data adapter
publishes the queue and transcript together, including when an event delivers an HTTP-only prompt.

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
Local `composer/retry.ts` reuses the admission ID on an explicit resend of the same restored prompt, including
after reload. The compact fingerprint covers the outgoing request and backend. Timeline and inbox evidence
can settle a retry locally, and replayed HTTP receipts leave queue membership to the existing inbox refresh.
The optional draft record can reconstruct the original model while the catalog loads.
Model selection follows the local `providers/models/{configured,selection-machine}.ts` boundaries. The catalog
resolver applies saved, source and server defaults in order. The selection machine picks an available model and
its variant together from the scoped draft, durable session or global fallback. The composer applies per-model
preferences and agent defaults when the winning choice inherits a variant. A ten-second acknowledgement
deadline retains local preferences, and older cancellation or acknowledgement cannot retire a newer choice.
Optional agent-catalog stalls do not disable successfully loaded models.

Permission/question replies and directory lists use compact-local `session/requests/{reply-machine,list-machine}.ts`.
Replies have 15/30-second deadlines respectively. List reads cannot release active replies; SSE-created requests
survive older snapshots, and settled IDs cannot be resurrected. Attempt IDs reject older HTTP completion after an
SSE acknowledgement and a subsequent reply. Child routing, notification delivery, answer state and web-search
behavior retain their existing owners. No app-source imports, parent edits or shared-package exports are added.

Permission notification delivery follows the main app's separate notification machine and driver boundaries.
The local `shell/notifications/machine.ts` owns deduplication, attempt IDs and retirement. The driver retains
translated copy, desktop-first delivery and the browser fallback. The permission adapter scopes the controller
to a runtime activation and verifies that the request still belongs to its active tree. Refresh can notify again
for the first pending request, while older permission grants cannot deliver after a refresh, reply or navigation.

The request dock and permission notifications follow the active session tree, including older subagents outside
the recent-session page. The compact `session/requests/request-ancestry.ts` driver follows missing parent IDs
through public `session.get` reads for pending permissions, questions and web-search forms. Walks share reads,
release them on settlement or navigation, and offer Retry on a failed read or a 30-second chain deadline.
The recent-session picker retains its 12-row pages.

Attachment preparation follows local `composer/attachments/{preparation-machine,preparation}.ts`, using the main
app's upload machine/driver separation without adopting server uploads or a global upload service. Picker, paste,
drop and input gestures capture draft ownership before work begins. Reset/restoration, navigation and disposal
retire pending reads; completed files and ordinary edits retain the existing compact draft rules. A 60-second
inactivity deadline begins after selection and renews after each processed file. Send and alternate delivery wait
for all preparation, with a public `Loader` and cancellation control; typing and Stop remain available. Native
picker tokens are released once, even for late selections, and cleanup does not block sending. Inline formats,
filtering, duplicate detection, RPC schemas and persistence stay local and unchanged. Tests cover stale results,
partial failures, cancellation, timeout/retry, send admission, caret preservation and native undo/redo.

Inline attachment persistence follows the main app's `runtime/persistence/drafts.ts` boundary. The compact
adapter reads the source once to produce the stored data URL. It derives the SHA-256 ID from those same bytes
through the public `@opencode/util/base64` decoder. Browsers without SubtleCrypto keep the random-ID fallback.
Legacy URL-only drafts and the existing filename, MIME and content-ID fields remain readable.

Animated presence follows local `runtime/{presence-machine,presence,animated-presence}.ts`, matching the main
app's machine/driver boundary. Visibility, retained values and minimum-duration attempts are pure transitions;
DOM listeners, reduced-motion observation and timers stay in the driver. CSS animation and transition exits have
computed deadlines with 50 ms grace, including a 250 ms base for animations with no duration. Reappearance,
identity/element changes and disposal retire old exits. Existing component styles and accessor contracts remain.
The compact-only `shell/commands/menu-dismiss{,-machine}.ts` shares close ownership between the model picker
and attachment menu: detach, retain the existing two-frame focus delay, then act once, with a 600 ms deadline.
Gesture-time captures prevent late attachment completion from acquiring a newer opening. Reopening, draft/session
replacement and disposal cancel stale callbacks; lazy model-manager completion checks the same ownership.
Native/browser pickers still open in the user gesture. These implementations use existing public UI motion and
control APIs, with no parent-package edits, app-source imports or new shared exports.

## Remaining compact responsibilities

- Embedding controls, `current/9`, tab keys, welcome, local assets and the recent-session picker's 12-row page size.
- Deployment-owned model defaults, provider and model visibility, and the persisted server/directory/session/agent scope.
- Nine-dialog hydration and snapshot retention stay local to the runtime. The receipt cache preserves compact queue ordering and acknowledgement timing.
- Compact draft formats (including inline URLs), comments, undo/redo, request routing and suggestion filtering, keys and sizing.
  Queue undo preserves unrepresentable context and merges the latest draft only after cancellation.
  Question state stays local without the main app's global draft cache, collapse controls or global shortcuts.
- Review requests retain three context lines, bounded patches and 100 ms file-event coalescing.

Queue editing/reordering, credentials, staged/history/comment review, docking, terminal, summary panels,
browser, remote servers and extension hosting require a product decision. Public APIs also lack atomic queue
reordering, staged-only/end-revision diffs and GUI host contexts.

## Validation

Run `bun test`, `bun run typecheck`, `bun run build`, and browser interactions without restarting app/server.
Request widgets, pickers and the composer also use `bun run test:components`. Keep evidence in ignored `node_modules/.cache/`.

Transcript attachment downloads (2026-11-24). The original production bundle rendered delivered and just-sent
files as inactive cards. The updated fixture downloaded the exact binary, zero-byte and pending UTF-8 payloads
using click, Enter and Space. It covered a comma in a quoted MIME parameter, a revoked blob URL, image preview
and draft retention. The live agent’s message picker returned focus to the `1/9` counter on Escape.

All 744 Bun tests, 101 browser tests, typecheck and both production builds passed. The updated source maps
contained zero main-app or desktop modules. Three-run medians before and after were 175/186 ms for entry,
83/90 ms for switching and 87/90 ms for streaming. Both runs made the same 125 requests by endpoint.
Evidence is in `node_modules/.cache/timeline-attachment-downloads/`.

Saved-session recovery and Jump search (2026-11-24). On the original production build, a 500 opened a draft
and a filename search missed a prompt with display text. Both regressions passed on the updated bundle. Retry
restored the conversation, draft text and attachment after a 500, a 404 naming another session and a mismatched
success response. A matching 404 opened the saved draft. The picker found card excerpts with zero file or
history reads. On the live agent, a Chinese search matched the prompt and Escape returned focus to **1/9**.

All 744 Bun tests, 98 browser tests, typecheck and both production builds passed. The updated source maps
contained zero main-app or desktop modules. Three-run medians before and after were 179/186 ms for entry,
75/88 ms for switching and 87/91 ms for streaming. Both benchmarks made the same 155 requests by endpoint,
including the history, scrolling and runtime Retry checks. Evidence is in `node_modules/.cache/recovery-jump/`.

Jump to message (2026-11-24). An 11-prompt production fixture searched the latest nine, jumped to the
oldest visible prompt and retained the draft across a viewport resize. It recorded zero extra message
reads. A second fixture found a match near the end of a multiline prompt and closed the picker on session
replacement. The live Chinese agent jumped to its prompt and returned to latest at `1/9`.
The scrolling benchmark now checks focus and sends Page Up to the focused viewport. The former
`tabindex="0"` assertion failed on both builds with the current shared `ScrollView`. Keyboard scrolling,
streaming while paused, session switching and nine-dialog Undo/Redo passed on both builds.
All 743 Bun tests, 95 browser tests, typecheck and both production builds passed. Both builds' source
maps contained zero main-app or desktop modules. Three-run medians before and after were 172/180 ms
for entry, 83/84 ms for switching and 91/90 ms for streaming. Both runs made the same 87 requests by
endpoint. Evidence is in `node_modules/.cache/jump-to-message/`.

Timeline model labels (2026-11-24). The original production build kept the raw ID after the catalog loaded.
The updated build showed the catalog name, the recorded variant and both speed-change notices. Unknown
models retained their IDs, and switching back to a session with an empty catalog restored its fallback labels.
The fixture counted one provider read and one model read for the activation. The live agent showed matching
model names in the transcript and picker at `1/9`. All 743 Bun tests, 93 browser tests, typecheck and both
production builds passed. Both builds’ source maps contained zero main-app or desktop modules. Three-run
medians before and after were 176/182 ms for entry, 82/82 ms for switching and 91/88 ms for streaming.
Both benchmarks made the same 87 requests by endpoint. Evidence is in `node_modules/.cache/timeline-model-catalog/`.

Live shell output and changed files (2026-11-24). Two production browser tests reproduced missing direct
and background shell output on the original build. Both passed on the updated build, and expanding a
saved transcript made zero shell requests. Runtime tests covered stale inventory, reconnect and cancellation
on rapid directory changes. The changed-files tests covered eviction and retry within the nine-dialog window.
All 743 Bun tests, 92 browser tests, typecheck and both production builds passed. The live session showed Ready
at `1/9`. Source maps from both builds contained zero main-app or desktop modules. Three-run medians before
and after were 181/176 ms for entry, 74/83 ms for switching and 91/91 ms for streaming. The benchmark made
the same 103 requests by endpoint, including four turn diffs and 12 review reads.
Evidence is in `node_modules/.cache/shell-turn-parity/`.

Timeline message cards (2026-11-24). Both new browser cases reproduced the missing cards on the original
production build and passed on the updated build. The fixture showed quotes and notes on a prompt with empty
display text, and a server-file reference beside an inline attachment with zero file reads. The live session
showed Ready at `1/9` with its chart and composer available. All 743 Bun tests, 90 browser tests, typecheck and
both production builds passed. Three-run medians before and after were 176/171 ms for entry, 72/71 ms for session
switching and 91/92 ms for streaming. The 87 requests matched by endpoint. Both updated builds' source maps
contained zero main-app or desktop sources. Evidence is in `node_modules/.cache/timeline-cards/`.

Question and tool expansion validation (2026-11-23). Two browser regressions reproduced the loss of an explicitly
checked option on the original dock. Both passed after the refactor. The original and updated controllers also
agreed on selection, focus, progress and replies across 24,000 interactions with distinct option and custom values.
The session fixture verified independent shell and edit defaults, manual patch disclosure and persistence after
reload. The live Chinese menu toggled both settings and returned to its original values at `1/9`.
All 742 Bun tests, 88 browser tests, typecheck and both production builds passed. Before/after three-run medians
were 157/171 ms for entry, 69/63 ms for switching and 88/90 ms for streaming. Per-endpoint counts matched across
87 requests in each build. Both updated builds’ source maps contained zero main-app or desktop sources.
Evidence is in `node_modules/.cache/question-timeline/`.

Eight-commit browser verification (2026-11-23). On the live agent, recent sessions expanded from 12 to 24,
title search returned two matches, and scrolling up then choosing Jump to latest resumed the timeline.
The fork picker, model and variant menus, and review refresh also worked. An isolated production session
accepted a conditional MCP reply, promoted a queued message, restored a queued file with Undo, switched
model and variant, and forked from a delivered prompt with draft replacement confirmation.

Reselecting the restored JSON file produced two attachment cards on the committed build. The fix retained
one card and the original draft across reload, including when the picker supplied a different MIME header.
The browser suite also reproduced and verified the fix for random attachment IDs without SubtleCrypto.
Changed bytes and renamed copies stayed independently attachable. All 741 Bun tests, 86 browser component
tests, typecheck and both builds passed. The production timeline, history, runtime and review checks made the
same 97 requests before and after, including 12 VCS reads. Evidence is in `node_modules/.cache/eight-commit-browser/`.

Inline attachment validation (2026-11-23). The production fixture counted two full reads of a source file
before the refactor and one afterward. Both builds preserved attachment bytes and IDs across reload for
empty, Unicode and binary files, including MIME parameters with commas, the fallback decoder and browsers
without SubtleCrypto. Cancelling an in-flight hash discarded that attachment and preserved the next file and
draft. Escape returned focus to the attachment menu trigger on the live agent at `1/9`. All 740 Bun tests,
86 browser component tests, typecheck and both production builds passed. The three-run benchmarks made the
same 87 requests. Both updated source maps included the shared decoder and zero main-app or desktop modules.
Evidence is in `node_modules/.cache/inline-draft-attachments/`.

Pending-inbox validation (2026-11-23). All 36 reactive runtime tests passed against the original and refactored
implementations. Both production builds passed the same five queue and prompt-retry scenarios. In the queue fixture,
Send moved one prompt into the transcript and Undo restored another to the draft while an inbox read was stalled.
Releasing that read and completing the next refresh preserved both actions. The live follow-up menu opened and
dismissed at `1/9`. All 740 Bun tests, 81 browser component tests, typecheck and both build configurations passed.
The history and runtime Retry fixtures also passed. Three-run medians before and after were 177/178 ms for entry,
67/70 ms for session switching and 90/89 ms for streaming. Both runs made the same 87 requests. Neither updated
build's source maps included main-app or desktop modules. Evidence is in `node_modules/.cache/pending-receipts/`.

Recent-session search validation (2026-11-23). All 25 page-loader and query tests passed against both versions.
Both production builds of the picker kept a separate exact match alongside 12 title matches, then appended a
fourteenth row on Load more with one exact lookup in total. On the live agent, Load more expanded 12 rows to 24,
title search returned two matches and Escape restored focus to the trigger. All 740 Bun tests, 80 browser component
tests, typecheck and both build configurations passed. The three-run medians before and after were 199/185 ms
for entry, 69/68 ms for switching and 87/90 ms for streaming, with the same 87 requests. Only the two local
search modules changed in the browser build's mapped sources. Evidence is in `node_modules/.cache/compact-parity/`.

Review event routing validation (2026-11-23). All 22 review model tests passed against both implementations.
Fake-clock checks covered the 99/100 ms boundary in working-tree, branch and committed comparisons, including
POSIX, Windows drive and UNC directories. In the production browser fixture, three file events produced one
working-tree refresh. Both builds issued the same 12 VCS comparisons and four turn-diff reads. The live review
also refreshed and closed at `1/9`. All 738 Bun tests, 79 browser component tests, typecheck and both production
builds passed. Both updated builds' source maps contained zero main-app or desktop modules. Evidence is in
`node_modules/.cache/review-event-routing/`.

Model-selection validation (2026-11-23). The original and refactored resolvers agreed on 1,176 catalog defaults
and 6,384 scoped model and variant combinations, including ambiguous legacy IDs and unavailable models. The
production browser fixture passed on both builds for model switching from budget notices and retrying a prompt
while the catalog loads. On the live agent, filtering kept the selected model and Escape restored composer focus
at `1/9`. All 734 Bun tests, 79 browser component tests, typecheck and both production builds passed.
Both updated builds' source maps contained zero main-app or desktop modules. Evidence is in
`node_modules/.cache/model-selection-parity/`.

Timeline pause/resume validation (2026-11-23). The extracted rules matched the original scroll action and jump
visibility across 2,592 combinations of reader input, pause state and viewport geometry. The production fixture
passed on both builds for reflow, streaming while paused, wheel, keyboard, scrollbar drag, text selection and
session switching. Its drag now waits for the scrollbar thumb to settle after streaming. The live agent showed
**Jump to latest** after Page Up and returned to the end at `1/9`.

All 732 Bun tests, 79 browser tests, typecheck and both production builds passed. The three-run medians before
and after were 177/185 ms for entry, 70/69 ms for session switching and 90/88 ms for streaming. Both runs
made the same 87 requests. Both updated builds' source maps contained zero main-app or desktop modules.
Evidence is in `node_modules/.cache/timeline-follow/`.

MCP form refactor validation (2026-11-23). The original and refactored controllers produced the same visible
fields, completeness and typed answers after 480 edits. The production routing fixture covered child and
directory-wide forms, keyboard submission, dismissal and retry. All 728 Bun tests, 79 browser tests, typecheck
and the production build passed. Evidence is in `node_modules/.cache/mcp-form-refactor/`.

Fork command validation (2026-11-23). All 727 Bun tests, 79 browser tests, typecheck and both production builds
passed. The original build lacked the fork command in the composer menu. Eight fork scenarios passed against
the updated production bundle, including search within the nine-dialog window, attachment-only prompts, pending
and reverted rows, draft protection, and dispatch to a server-defined `/fork` with arguments. On the running
agent, Escape returned focus to the composer at `1/9`. Both live processes stayed running.

Three-run production medians before and after were 176/183 ms for entry, 69/69 ms for session switching and
87/91 ms for streaming. Both runs made 87 requests with matching endpoint counts. Both updated builds’ source
maps contained zero main-app or desktop source modules. Evidence is in `node_modules/.cache/fork-command/`.

Prompt retry and budget notice validation (2026-11-22). All 725 Bun tests, 76 browser tests, typecheck and
both production builds passed. The original build issued a fresh ID after a lost acknowledgement and lacked
the budget notice action. Five production browser cases passed on the updated build. They covered manual
resend before and after reload, local confirmation of an already delivered prompt, a retry before the model
catalog loaded, and both notice actions. The live agent returned focus to the composer on Escape and retained
its draft, model and `1/9` counter. Both live processes stayed running.

Three-run production medians before and after were 176/187 ms for entry, 68/72 ms for switching and 87/92 ms
for streaming. Each run of the suite made 87 requests with identical per-endpoint counts. Both updated builds'
source maps contained zero app or desktop source modules. Logs and benchmarks are in
`node_modules/.cache/retry-budget/`.

Markdown validation (2026-11-22). All 710 Bun tests, 71 browser tests, typecheck and both production builds
passed. The workspace image decoded to 96 pixels wide in the updated production fixture and zero on the original
build. Switching sessions cancelled a pending SVG read and displayed the new session’s image at the same path.
The fixture checked the wrap setting across reload and a single block’s override. After one page refresh during
development, the live agent picked up a Chinese label edit, toggled wrapping and returned to its original setting
at `1/9`. Both app and backend processes stayed running.

Three-run production medians before and after were 178/181 ms for entry, 69/69 ms for switching and 93/92 ms
for streaming. Endpoint counts matched across all 87 requests. Both output bundles contained zero app or desktop
source modules. Logs, benchmark results and the live menu screenshot are in `node_modules/.cache/markdown-parity/`.

Changed-files validation (2026-11-22). All 705 Bun tests and 69 browser tests passed, along with typecheck
and the default and browser-enabled builds. An 11-prompt fixture requested only the completed visible turn
with changed files, retried a failed read, expanded the patch and restored the preference on reload.
Driver tests cover a replacement idle marker, timeout and navigation during retry. A settings module update
exposed a context identity error in the live tab. After separating the context and refreshing the tab, another
settings update allowed the preference to toggle in Chinese and return to its original value at `1/9`.
Five-run production medians before and after were 167/169 ms for entry, 69/70 ms for switching and 92/91 ms
for streaming. Both builds made 145 requests with identical endpoint counts. Production source maps contained
zero app or desktop source modules. Evidence is in `node_modules/.cache/turn-diffs/`.

Fork and reconnect validation (2026-11-22). The original code failed the missed-permission and duplicate-notification
regressions. All 704 Bun tests, 68 browser tests, typecheck and both production builds passed. The browser
fixture recovered a child permission after reconnect. Forking from the oldest of nine visible
prompts in an 11-turn source restored its mention and attachment, then hydrated the two earlier turns on Retry.
Draft cancellation, edits during creation, a second message action, navigation and timeout all exercised the real
message menu. The live agent retained its draft after cancellation and returned to an empty composer at `1/9` after
the temporary test text was cleared. The browser page was refreshed during verification. Both processes stayed up.

Three-run production medians before and after were 162/173 ms for entry, 68/58 ms for switching and 91/92 ms
for streaming. The standard heartbeat fixture made 87 requests in each build. Repeating the comparison with a
server greeting on each connection added six permission-list reads across six connections (105 to 111 total
requests). All other endpoint counts matched. The browser-enabled production source maps contained zero
modules from the main app or desktop. Both full component runs passed. Build logs, test output, benchmarks
and the live confirmation screenshot are in `node_modules/.cache/reconnect-fork/`.

Event stream recovery validation (2026-11-21). Closing the live SSE reader reproduced a permanent disconnect
on the original implementation. A Vite update also reproduced a SessionCommands context mismatch that disposed
the active session. After the fixes, a stream-module hot update reattached the session. Holding its next SSE
fetch before it reached the server allowed a real MCP peer to create a directory-wide form during the gap.
On release, the tab fetched the pending form and submitted its typed answer, then dismissed a second live request.
Both writes returned HTTP 204, the peer received `accept` and `cancel`, and the document time origin and both
process IDs matched their original values. All 701 Bun tests, 63 browser tests, typecheck and both production
builds passed. Three-run medians before and after were 169/181 ms for entry, 66/62 ms for switching and
92/89 ms for streaming. Evidence is in `node_modules/.cache/mcp-elicitation/reconnect/`.

MCP input dock validation (2026-11-21). All 699 Bun tests, 63 browser tests, typecheck and both production builds
passed. The browser fixture dismissed an active-session request, retried a grandchild's typed reply and acknowledged
a directory-wide URL request. Unit coverage checks directory isolation and stale events. Three-run production medians
before and after were 167/174 ms for entry, 73/68 ms for switching and 91/92 ms for streaming. Both suites made
87 requests. The live session showed Ready at `1/9`. Evidence is in `node_modules/.cache/mcp-elicitation/`.

Directory matching validation (2026-11-21). The original loader dropped Windows drive, UNC and trailing-slash
matches. All 697 Bun tests, 63 browser tests, typecheck and both production builds passed after the change.
On the running agent, cancelling Rename for a recent row returned focus to Recent sessions at `1/9`.
Three-run production medians before and after were 168/171 ms for entry, 67/68 ms for switching and 90/91 ms
for streaming. Each run of the benchmark suite made 87 requests with identical per-endpoint counts.
Evidence is in `node_modules/.cache/directory-parity/`.

Timeline streaming validation (2026-11-21). The identity regression reproduced on the original mapping. All
693 Bun tests, 62 browser tests, typecheck and both production builds passed. The browser fixture streamed a
report URL across two updates and kept the earlier chart instance and its expanded source. On the running agent,
opening and closing the chart source restored its controls at `1/9`. Three-run production medians before and after
were 172/166 ms for entry, 67/69 ms for switching and 122/91 ms for streaming. History and scroll checks passed,
and both runs made the same 139 requests across the same endpoints. Evidence is in
`node_modules/.cache/timeline-projection/`.

Session action refactor validation (2026-11-21). All 692 Bun tests, 61 browser tests, typecheck and both
production builds passed. Browser fixtures covered early rename acknowledgement, a competing title during a
save, and retry after a delete response named the wrong session. The live agent returned focus to the header
after cancelling Rename and to Recent sessions after cancelling a row deletion. Production source maps contained
no main-app modules. Across six runs per build, median entry, switch and streaming times went from 179, 72 and
149 ms to 187, 71 and 121 ms respectively. Per-endpoint request counts matched in both three-run comparisons.
Evidence is in `node_modules/.cache/session-action-refactor/`.

Child request routing validation (2026-11-21). The original production build missed a child's permission beyond
the first 12 recent sessions. With the fix, the browser fixture answered that permission and a grandchild's
question at their respective session endpoints after a single recent-session page read. All 690 Bun tests,
58 browser tests, typecheck and both production builds passed. The live agent returned to its composer at
`1/9` after dismissing Recent sessions. Three-run production medians before and after were 165/172 ms for
entry, 64/71 ms for switching and 122/119 ms for streaming. Per-endpoint request counts matched.
Evidence is in `node_modules/.cache/request-ancestry/`.

Session actions validation (2026-11-19). All 689 Bun tests, 57 browser tests, typecheck and both production
builds passed. The browser fixture exercised row and header actions, rename retry, delete cancellation and timeout,
event acknowledgement before HTTP, navigation after deletion, draft retention and JSON downloads. Live Playwright
on port 4777 verified the recent-row context menu, cancellation, focus return and the context export control with
zero API writes or page errors. Three-run production medians before and after were 169/167 ms for entry, 63/57 ms
for switching and 173/176 ms for streaming. Evidence is in `node_modules/.cache/context-export/`.

Recent-session validation (2026-11-18). The original picker stayed on Loading after a simulated deadline, and an
older background response could replace a newer child-session list. All 689 Bun tests and 52 component tests pass
with the fix, along with typecheck and the default and browser-enabled builds. The picker fixture verified that
Retry appended the next page and kept the highlighted row. Live Playwright verified search, Escape and reopening
against the running app after in-app tab selection timed out. All three list reads returned HTTP 200.
Three-run production medians before and after were 156/169 ms for entry, 62/58 ms for session switching and
173/178 ms for streaming. Request counts matched. Evidence is in `node_modules/.cache/recent-sessions-parity/`.

Nine-dialog history validation (2026-11-18). The runtime regression reproduced `3/9` before the change and
verified `9/9` after one older-page read. All 684 Bun tests, typecheck and both production builds passed.
The production fixture passed Undo, Redo and recovery after a stalled read. The open browser still showed `1/9`
with both live processes running. The component suite passed 50 of 51 tests. The chart source Copy click failed
at the same assertion in an isolated checkout of the original code. Three-run production medians before and after
were 185/181 ms for entry, 66/67 ms for switching and 172/179 ms for streaming. Evidence is in
`node_modules/.cache/nine-dialog-history/`.

Attachment menu focus validation (2026-11-18). The original menu closed on a timer and dropped an immediate Arrow
Down reopen. Closing in the picker gesture restored keyboard reopening and preserved menu focus after a late read.
The regression passed five focused runs and the full 51-test component suite passed. The live app and backend stayed
running. Evidence is in ignored `node_modules/.cache/attachment-menu-focus/`.

Permission notification validation (2026-11-18). Eight delayed-delivery regressions reproduced against the original
implementation and pass with the refactor. All 683 Bun tests, typecheck and the production build passed. The component
suite passed 50 of 51 tests. The attachment menu focus case failed at the same assertion in the original checkout.
Three-run production medians before and after were 185/186 ms for entry, 66/71 ms for session switching and
169/126 ms for streaming. After in-app browser access timed out, live Playwright verified that activating a recent
session returned HTTP 200 for its permission list, showed `1/9`, and let the recent-session picker dismiss with Escape.
The smoke check recorded no page errors, failed API responses or API writes. Both live processes stayed running.
Logs and screenshots are in ignored `node_modules/.cache/permission-notifications/`.

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

Optional checks include `BENCH_VERIFY_HISTORY=true`, `BENCH_VERIFY_RUNTIME=true`, `BENCH_VERIFY_CONTEXT=true`,
`BENCH_VERIFY_REVIEW=true` and `BENCH_VERIFY_UI=true`. Use `BENCH_BROWSER`, `BENCH_DIST` and `BENCH_OUTPUT` to
override the defaults.
`BENCH_VERIFY_HISTORY=true` reopens a staged history, checks the exact nine visible turns, and exercises
Undo and Redo through the header while checking the composer draft.
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
