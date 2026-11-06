# 7777 with Nexus and rho

The `nexus_backend` branch runs the 7777 SolidJS conversation UI in a local browser. Nexus stores conversations, authenticates the person sending each message, and dispatches replies to the answering agent registered by the local rho daemon.

## Local development

Use the OpenCode monorepo's Bun version and a checkout of the Nexus TypeScript SDK. The SDK's HTTP and realtime entry points run on the Vite server. The realtime entry point uses `ws`.

Build the SDK from its checkout with its pinned pnpm version, then link it into this package before installing workspace dependencies. The local link is ignored by Git.

```sh
cd "<nexus-checkout>/sdks/typescript"
pnpm install --frozen-lockfile
pnpm run build

cd "<repo-root>/packages/nexus-ui"
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

Run `bun run dev` in this package and visit [the local chat](http://localhost:4779/). For a local production-build check, run `bun run build` and `bun run serve` with the same configuration. Both Vite modes serve the Nexus bridge alongside the page.

The SigmaAgents **Nexus** tab loads the bundled `sigma-agents/nexus-ui.html` entry. Start Nexus and rho, then launch the SigmaAgents desktop with `NEXUS_MEMBER_TOKEN` in its environment. The desktop serves the bridge itself and keeps the tab's browser storage in the dedicated `persist:desktop-tab-nexus-ui` partition. rho discovers the Nexus backend from its existing connection, for example `http://127.0.0.1:3000` in local development.

The bridge reads `$RHO_HOME/tmp/announcement.json` (`~/.rho` by default). It keeps the control bearer on the server for scoped rho operations such as runner discovery, channel ownership, recorded file changes, and site grants. The Human member token authenticates conversation and input writes to Nexus. Browser requests use only the same-origin `/api/7777` routes. Keep both credentials out of `VITE_*` variables.

## Conversation behavior

- **Recent sessions** searches and pages through either active or archived root conversations in the current workspace. The header shows the conversation title, runner and status; **Conversation actions** renames, archives or restores it. Archived and channel-owned chats cannot receive new messages here.
- The new-chat draft and each conversation’s draft, send choices and uncertain submission receipt are stored separately under the Nexus origin, Human, workspace and answering agent. Switching chats or reloading never resubmits a message. A deliberate retry uses the original input and mutation keys.
- **Run settings** selects a runner for a new chat, the current rho preset’s model or an explicit model, and a permission policy. During a reply, Enter steers by default; choose **Queue after reply** for separate work. Ctrl/Cmd+Enter sends an immediate steer, or promotes the latest waiting steer when the editor is empty. The pending label follows the delivery mode Nexus accepted.
- The timeline retains the latest **nine** user dialogs. Streamed text and reasoning follow their answer variant. A background receipt or context summary is a disclosure, not another user dialog. Reconnecting reads the durable history and pending work again.
- **Activity** shows in-progress runs, steps waiting for attention, child conversations and communication links. Pause or resume a run, retry or abandon a failed step, or stop a branch. **Stop all work** uses the conversation cancellation command, including background work after the visible reply ends. Expand **Tools and activity** under an answer for recorded rounds, task output, captures and sealed model requests.
- The decision dock accepts typed answers or one-time approvals. For a held native `web_fetch` call, a Human with verified write access can also ask rho to allow that site until restart. Only rho derives the site rule from the held call.
- **Usage** separates the cumulative request, token and cost totals from the latest reported context window and actual model. When some requests have no price, the amount is a **known subtotal**.
- Files belong to a particular answer variant or task. Download published files, preview Markdown and images, or open a recorded Git patch and add a line comment to the current draft. Explicit file paths in an answer are resolved on its conversation runner within the bound output directory; a bare filename in prose does not create a file card.
- **Code mode** and **Subagent** in **Run settings** control the tools available to future replies in that chat. A new draft starts with rho’s defaults; an existing chat saves a switch immediately. Changes leave running replies and prepared retries alone. Code mode requires the rho Code mode plugin.
- Sending requires a rho daemon with `POST /conversations/prepare-input-policy`. After verifying Human write access, the bridge seals rho’s exact tool list and optional executor contexts into the send ticket. An empty list means no tools; omitted contexts stay inherited. If rho refuses or cannot prepare a policy, no new input is sent.
- Browser file uploads, queue reordering, undo and export remain outside this integration. The source-controlled `manageModels` policy and the embedding host’s document-title control through `SET_DOCUMENT_TITLE` remain in place.

## Code Layout Parity Review

7777 owns the Nexus integration. Its compact header menus, result disclosures and decision dock replace rho-webui’s sidebar and panel framework.

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
| `server/` | Loopback middleware; Human/workspace and channel ownership checks; scoped chat writes, rho mode reads and updates, policy-bound send tickets, realtime subscriptions, execution inspection, and variant-bound artifacts and reviews. |
| `src/nexus/` | Browser transport, per-conversation drafts, turn projection, delivery and mode controls, typed decisions, usage, activity and output views. These adapters consume Nexus/rho data rather than the main app’s OpenCode runtime. |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact header, bounded timeline, paged recent picker and composer. Shared timeline, Markdown, file review, line comments, dialogs and controls come from public `@opencode/session-ui` and `@opencode/ui` exports. |

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
