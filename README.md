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

The SigmaAgents **Nexus** tab loads the bundled `sigma-agents/nexus-ui.html` entry. Start Nexus and rho, then open **SigmaAgents settings → Nexus** in the desktop. Save your Human member-plane token and, if needed, the rho home directory. Reopen or reload the Nexus tab to reconnect; no desktop or rho restart is required. The desktop serves the bridge itself and keeps the tab's browser storage in the dedicated `persist:desktop-tab-nexus-ui` partition. rho discovers the Nexus backend from its existing connection, for example `http://127.0.0.1:3000` in local development.

Desktop settings override `NEXUS_MEMBER_TOKEN` and `RHO_HOME` from the desktop environment. The password field stays empty on load; leaving it empty preserves the saved token. Clearing the saved token and saving restores environment fallback; resetting to defaults removes both overrides. Tokens are encrypted in desktop SQLite and never bundled into renderer assets. Standalone `bun run dev` and `bun run serve` continue to read this package's `.env.local`.

The bridge reads `tmp/announcement.json` under the saved rho home directory, otherwise `$RHO_HOME` (`~/.rho` by default). It keeps the control bearer on the server for scoped rho operations such as runner discovery, channel ownership, recorded file changes, and site grants. The Human member token authenticates conversation and input writes to Nexus. Browser requests use only the same-origin `/api/7777` routes. Keep both credentials out of `VITE_*` variables.

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

| Boundary | Responsibility |
| --- | --- |
| `server/` | Loopback middleware; Human/workspace and channel ownership checks; scoped chat writes, rho mode reads and updates, policy-bound send tickets, realtime subscriptions, execution inspection, and variant-bound artifacts and reviews. |
| `src/nexus/` | Browser transport, per-conversation drafts, turn projection, delivery and mode controls, typed decisions, usage, activity and output views. These adapters consume Nexus/rho data rather than the main app’s OpenCode runtime. |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact header, bounded timeline, paged recent picker and composer. Shared timeline, Markdown, file review, line comments, dialogs and controls come from public `@opencode/session-ui` and `@opencode/ui` exports. |

`runtime/i18n/language.tsx` owns `UiI18nBridge` and reuses the public UI template formatter and parameter type. The retained composer suggestions and recent-session picker use `MenuScroll` from `@opencode/ui`; their compact controllers retain sizing, keyboard selection and focus restoration.

Timeline scrolling follows the main app's `session/timeline/interaction.ts` boundary. The screen now uses the same
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

Recent-session loading follows `home/sessions/{index,queries,load-machine}.ts`: the index retrieves Nexus
conversation pages and filters titles, IDs and duplicates; the query driver owns cancellation and search debounce
timers; the pure machine owns results, cursors, request attempts and loading/error transitions. Closing or replacing
a query invalidates late responses, including reopening the same query. These modules stay local to 7777.

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

The local `markdown-echarts-options.ts` boundary accepts JSON data only. JavaScript callbacks, custom/plugin chart
types, maps, and option wrappers (`option`, `baseOption`, `options`, `media`) are unsupported. Tooltip rendering uses
rich text; HTML data views, navigation links, image resources, prototype keys, and regex dataset filters are excluded.
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
