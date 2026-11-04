# 7777 with Nexus and rho

The `nexus_backend` branch runs the 7777 SolidJS conversation UI in a local browser. Nexus stores conversations, authenticates the person sending each message, and dispatches replies to the answering agent registered by the local rho daemon.

## Local development

Use the OpenCode monorepo's Bun version and a checkout of the Nexus TypeScript SDK. The SDK's HTTP and realtime entry points run on the Vite server. The realtime entry point uses `ws`.

Build the SDK from its checkout with its pinned pnpm version, then link it into this package before installing workspace dependencies. The local link is ignored by Git.

```sh
cd "<nexus-checkout>/sdks/typescript"
pnpm install --frozen-lockfile
pnpm run build

cd "<repo-root>/packages/7777"
mkdir -p .local
ln -s "<absolute-path-to-nexus-checkout>/sdks/typescript" .local/nexus-sdk

cd "<repo-root>"
bun install
```

Rebuild the SDK after updating its checkout. The package exports compiled files from its `dist` directory.

With Nexus running and rho connected, check `rho status` for an adopted workspace and a declared default model. In Nexus personal token settings, issue a **member-plane** token for the Human account with access to that workspace. Put the following in this package's ignored `.env.local`.

```dotenv
NEXUS_MEMBER_TOKEN=<personal-member-token>
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false
```

Run `bun run dev` in the package and open [the local chat](http://localhost:4777/). For a local production-build check, run `bun run build` and `bun run serve` with the same configuration. Both Vite modes provide the local API. A standalone static-file host would also need to provide that API. The packaged Electron integration is deferred.

The bridge reads `$RHO_HOME/tmp/announcement.json` (`~/.rho` by default). It uses the announced control bearer only for loopback rho status, conversation environment, and runner discovery. It authenticates to the announced Nexus origin with the Human token, validates the member profile and workspace, and discovers rho's answering agent, runner and model. The browser receives display data, scoped conversation identifiers, and chat updates through the same-origin `/api/7777` routes. Keep both credentials out of `VITE_*` variables.

## Conversation behavior

- **New session** opens a draft. The first send creates the conversation in rho's workspace and submits a reply input. A retry uses the original mutation keys. Reloading restores the current conversation and draft under the matching Nexus origin, user, workspace and agent.
- **Recent sessions** lists accessible conversations answered by the same agent, ordered by last activity. Search, keyboard navigation and pagination use the compact picker.
- The timeline shows the latest nine user dialogs and the header shows the current count out of nine. Live text follows its turn and variant. The settled Nexus turn supplies the final answer. Reconnecting reloads history and pending work.
- **Stop** cancels the conversation's active execution. Tool approvals and agent questions appear in the composer dock. 7777 requests per-turn approval under rho’s rules. The dock shows the Bash command and any explicit working directory. Allow once or Deny applies to that run and task.
- The browser release offers text chat. Attachments, queue editing, model selection, file review, undo, and export are deferred. The source-controlled `manageModels` policy remains in the model defaults. The embedding host retains document-title control through `SET_DOCUMENT_TITLE`.

## Code Layout Parity Review

7777 owns the Nexus integration. The parent UI packages continue to supply shared presentation components.

Animated presence follows the main app's `runtime/{presence-machine,presence,animated-presence}.ts` boundaries
with local implementations. Pure transitions own visibility, retained values and minimum-duration attempts;
the driver owns DOM listeners, reduced-motion observation and bounded CSS exit timers. Reappearance, replacement
elements, identity changes and disposal retire previous exit work. Immutable snapshots stay outside Solid stores.
The retained attachment menu uses the compact-only `shell/commands/menu-dismiss{,-machine}.ts` adapter to bound
close-before-action work at 600 ms while preserving the two-frame focus-settlement delay after detachment.
Each gesture captures its original element and opening attempt, so reopening, draft/session replacement and
disposal cancel stale callbacks. Browser-enabled test helpers live in `src/test/browser.ts`, independently of
the removed OpenCode runtime. Existing public UI controls and styles remain reusable without parent-package edits.

| Boundary | Responsibility |
| --- | --- |
| `server/` | Local Vite middleware, credential and workspace checks, rho runner context and tool discovery guidance, retryable Human-authored Nexus inputs, realtime subscriptions and SSE. |
| `src/nexus/` | Browser transport, scoped drafts and retry state, conversion of Nexus turns to the shared session document, and typed decision forms. |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact session layout, message timeline, welcome screen, recent-session picker and composer. These reuse public controls from `@opencode/ui` and `@opencode/session-ui`. |

`runtime/i18n/language.tsx` owns `UiI18nBridge` and reuses the public UI template formatter and parameter type. The retained composer suggestions and recent-session picker use `MenuScroll` from `@opencode/ui`; their compact controllers retain sizing, keyboard selection and focus restoration.

Timeline scrolling follows the main app's `session/timeline/{interaction,machine}.ts` layout. The screen now uses the same
public `ScrollView` from `@opencode/ui/scroll-view` for its focusable viewport, keyboard navigation, nested-scroll
ownership, and draggable scrollbar. `createAutoScroll` from `@opencode/ui/hooks` still owns following streamed content,
pausing for reading or text selection, and overflow anchoring. The local adapter pauses on upward keyboard navigation
and uses the main app's arrival check so delayed scroll events cannot cancel that intent. Reaching the end or using
**Jump to latest** resumes following. On activation and explicit resume, the adapter keeps the timeline at the end
if layout briefly clamps the viewport before its scroll event arrives. Timeline input returns control to the reader.
The shared hook pins on viewport and content resize. While reading, the compact adapter updates **Jump to latest**
when content grows. The compact screen owns the viewport and resume control and retains the nine-dialog window.

Composer DOM synchronization stays in `composer/editor/{dom,machine}.ts`. Matching text and mentions retain their
nodes during attachment-only updates, preserving the caret and native undo/redo; in-place store edits still render.
`composer/editor/interaction.ts` delegates suggestion selection to public `@opencode/ui/typeahead` while retaining
compact shortcuts, query resets and focus behavior. `component-tests/composer.spec.ts` covers these retained editor
contracts with local suggestion fixtures. The OpenCode catalog loader and its loading/retry test are removed because
Nexus supplies the production text-only composer without those catalogs.

Composer mode and history recall now follow the main app's `composer/suggestions/machine.ts` and
`composer/editor/interaction.ts` boundaries. The persisted draft owns mode; machine commands request changes,
and the controller's `mode()` accessor supplies rendering, keyboard handling and history selection. One immutable
signal snapshot owns interactions. Its explicit idle/browsing history state replaces separate index and saved-draft
fields; pure transitions decide eligibility, entry changes and restoration. The driver retains DOM selection checks,
metadata capture/restoration, prompt cloning and caret placement. Saved drafts stay outside mutable Solid stores.

7777 intentionally keeps history separate from suggestion popovers and continues browsing after editing a recalled
entry. Plain-arrow boundaries, start/end caret placement, original attachment restoration, shortcuts and persisted
history formats remain unchanged. Draft-scope or session replacement retires recall without restoring an old draft;
the scope accessor works independently of attachment configuration. Delayed editor focus shares one cancellable
frame across commands, history, model dismissal and attachments. New requests replace older frames; typing,
owner changes and disposal cancel them. Callbacks recheck the captured editor, session, draft scope and store;
attachment completion also retains its menu-teardown and dialog guards. Rendered contracts live in
`component-tests/composer.spec.ts`; transition and driver suites cover snapshot isolation and ignored stale frames.

Retained attachment preparation follows local `composer/attachments/{preparation-machine,preparation}.ts` boundaries.
The main app's upload lifecycle is the structural reference; 7777 deliberately keeps inline files and has no server
upload destination or global upload service. One machine owns each gesture's attempt, picker/preparation phase and
completion. The driver owns timers, cancellation and caller settlement. `PromptState.scope` is an ephemeral token
replaced on reset or restoration, so navigation (including returning to the same session), draft replacement and
disposal retire pending work without writing files or errors into another draft. Ordinary typing keeps its scope,
and completed files append to the latest draft and retain its current caret.

When attachments are enabled, the composer shows the public `Loader` and **Cancel pending files** during preparation.
Sending, including Enter and alternate delivery, waits for every active preparation; blocked send attempts are not
replayed automatically.
Typing, attachment removal, navigation and Stop stay available. Cancellation retains completed attachments. Each
batch processes files in order and stops on failure, without cancelling independent batches. A 60-second inactivity
deadline starts when files are selected (or a native clipboard read begins) and renews after each processed file.
Time spent choosing files is excluded. Timeout reports one localized error and permits a fresh attempt.

The package-local picker bridge reports selection before native reads and completion before token cleanup. It
releases each token once, including selections returned after retirement, and skips subsequent reads after
cancellation. Native reads that cannot be physically aborted settle locally; their late results are ignored.
The desktop RPC contract and persisted draft/history formats are unchanged. FileReader work accepts cancellation;
hashing and other non-cancellable reads cannot publish retired results. Browser picker events retain their opening
scope, and focus return rechecks ownership after menu teardown and at the animation frame. New attachment labels
use the existing English fallback until translated. Machine/driver tests, the existing platform and editor suites,
and the composer browser fixture own these contracts.

The Nexus production composer remains text-only; these retained controls and fixtures do not enable attachments there.


Retained mention search follows local `composer/editor/mention-search-machine.ts` and `interaction.ts`, matching
the main app's machine/driver boundary. File reads debounce for 150 ms and have a ten-second deadline. Query,
menu, draft/session and search-source changes cancel prior work; attempt and owner checks reject late results.
Local suggestions filter immediately while files load, and failures retain those rows. Composer browser fixtures
forward cancellation and cover Escape, fresh reopening, timeout recovery and stale-file exclusion. The obsolete
OpenCode file-search adapter remains removed; the Nexus production composer does not enable file mentions.

Recent-session loading follows `home/sessions/{index,queries,load-machine,search-machine}.ts`. The index retrieves Nexus conversation
pages. The search machine filters by title or ID and excludes duplicates and the active conversation. Each visible page has one 30-second deadline across any cursor reads
needed to find matches. The query driver handles cancellation and search debounce. Closing the picker or changing
its source or query invalidates late responses. The load machine keeps the query, visible rows and cursor for **Retry**.

The local `session/timeline/projection.ts` adapts assistant text for the public `SessionTimeline`.
It wraps bare HTTP(S) URLs inside full-width Chinese parentheses as Markdown autolinks. Solid tracks
visible messages and content parts by object identity, so a text delta updates its existing part and
keeps earlier charts mounted. A replacement message gets a fresh view even if it has the same ID.
If a snapshot changes a text part to reasoning in place, the timeline uses the raw reasoning text.

`shell/routes/session-ui-provider.tsx` registers the local ECharts renderer through the public
`MarkdownCodeBlocks` API from `@opencode/session-ui/context/markdown`. Shared Markdown detects completed fences
and disposes each renderer when its block changes or leaves the timeline. The 7777 adapter in
`session/timeline/markdown-echarts.tsx` loads ECharts for recognized charts in timeline text parts, including
compaction summaries. Reasoning keeps its fenced code. Charts resize with their containers.
**Show source / Hide source** reveals the original highlighted JSON, and **Copy** copies that source.
The source stays readable while a chart loads or if rendering fails.
**Reset** recreates only that chart from its original options, clearing zoom, pan, dragged-node positions, and legend
selections while preserving source visibility and the chosen size/proportion. The adjacent **Small / Medium / Large**
and **Wide / Square** selectors change one chart's viewport without resetting interactions. Choices are temporary.

`session/timeline/markdown-echarts-layout.ts` selects initial layouts from series types, coordinates, and density.
The defaults were checked against the 24 chart examples in the compact timeline:

| Size   | Square                                                          | Wide                                                                              |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Small  | Gauge, completion doughnut, simple pies with up to three slices | Available as a manual choice                                                      |
| Medium | Labeled pie, rose, radar, funnel, polar bars                    | Line, stacked/grouped bars, scatter, bubble, boxplot, step/area, pictorial bars   |
| Large  | Force graph, sunburst                                           | Heatmap, Sankey, candlestick, tree, theme river, parallel coordinates, Gantt bars |

Small/medium/large widths are capped at 420/560/680px for square views and 640/840/1000px for wide views. All shrink to
the available pane width. Wide views use 16:9 with a 280px minimum height on narrow panes; square views remain 1:1.
Dense series, multiple grids, and multiple pie/gauge plots receive more space. Mixed chart types use the largest
required size. Radial trees and chord diagrams use square views; treemaps use large wide views.

Display-only adjustments reserve room for outside sunburst labels and separate a bottom legend from a bottom zoom
slider. A theme-river-only option missing `singleAxis` gets a time axis in place of unused Cartesian axes. Explicit
single-axis configurations remain intact. These defaults improve common layouts; arbitrary authored labels and
positions can still require manual sizing. Source JSON is preserved exactly.

Use a fenced `echarts` block containing a direct, strict JSON option object, for example:

````markdown
```echarts
{"title":{"text":"Example"},"series":[{"type":"pie","data":[{"name":"A","value":2},{"name":"B","value":3}]}]}
```
````

Fenced `json` blocks are also recognized when they contain a nonempty `series` object/array with supported built-in
types and `data`, `nodes`, or a `dataset`. Other JSON remains code. A chart appears when its fence closes or the
message finishes; incomplete JSON stays visible during streaming. Charts use a white surface with ECharts' light
defaults while honoring supplied colors and background options.

The local `markdown-echarts-options.ts` boundary passes JSON data to ECharts. In explicit `echarts` fences, a
`color` value written as `function() { return undefined; }` is read as `null`, so ECharts can use its default color.
JavaScript callbacks are never executed. Custom/plugin chart types, maps, and option wrappers (`option`, `baseOption`,
`options`, `media`) are unsupported. Tooltip rendering uses rich text. HTML data views, navigation links, image
resources, prototype keys, and regex dataset filters are excluded.
Only built-in `filter` and `sort` dataset transforms are supported. These presentation rules do not change stored
messages or copied source. Fixtures and browser coverage remain local in `component-tests/echarts*`.

The OpenCode-backed renderer and desktop packaging instructions are available on the `main` and `plm-meeting` branches. The nested Git checkout owns changes to this package.

## Verification

From the package directory, run the following.

```sh
bun test
bun run typecheck
bun run build
bun run test:components
```

For a live check, send a short text prompt, watch the streamed reply, reload, then open a fresh draft and reopen the completed chat from Recent sessions. Browser network inspection should show chat requests and an event stream under `/api/7777`. The Nexus acceptance event identifies the Human author and the turn identifies rho as the answerer.
