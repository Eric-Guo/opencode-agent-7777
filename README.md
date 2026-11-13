# 7777 with Nexus

7777 uses a same-origin `/api/7777` bridge. Nexus stores conversations and authorizes each message as its Human author. OpenCode’s managed service pairs separately as the answering agent and executes tools in the selected project directory.

## Pair OpenCode

Use a build of the service and SigmaAgents desktop extension that includes the native runtime. Local, dev and `eric_dev` builds enable it by default, including release packages built from `eric_dev`. For other release builds, enable `experimental.nexus_runtime` in the service user configuration and restart the managed service.

1. Open **SigmaAgents settings → OpenCode Nexus runtime**. Enter the Nexus origin, a Nexus text model, an absolute project directory and your Human member token from Nexus personal token settings.
2. Supply an existing Nexus workspace ID, or leave it blank to create a private workspace. Select **Pair OpenCode**, open the verification link and approve the agent on Nexus.
3. Select **Refresh connection**. Once the state is **ready**, open the Nexus tab and start a chat. The service restores the registration after a restart. File tools are scoped to that project. Approved shell commands run with the permissions of the OpenCode service account. The desktop encrypts the Human token separately and binds it to the chosen Nexus origin.

You can also pair from the CLI. Use the verification URL and code printed by the pair command. A desktop using an already-paired service can save its Human member token in the same settings section.

```sh
opencode nexus pair --url https://nexus.example.com --model PROVIDER/MODEL --directory /absolute/path/to/project
opencode nexus status
opencode nexus runners
opencode nexus schedules
opencode nexus memory
opencode nexus mcp
opencode nexus disconnect
```

For Human platform sign-in, use `opencode nexus login`, open the printed browser URL, then run `opencode nexus account`. Use `opencode nexus logout` to revoke that session. The service completes PKCE on a temporary loopback callback. The Human member token in the desktop or Vite bridge still authenticates chat input.

## Native tools and integrations

The selected project supports file reads, edits, filename and content search, shell commands, attachment import and publication, public web reads and a conversation-owned interactive terminal. File writes and edits retain checkpoints across service restarts. Shell reviews use OpenCode Git snapshots where the selected project supports them. **Restore files changed by this step** restores the recorded paths and refuses to overwrite later changes to them.

Code Mode runs confined JavaScript with the tools declared for the input. Child tool calls go through Nexus and use the same runner binding and approval policy.

The web reader converts HTML to Markdown. Binary responses and full text that exceeds the inline limit are available as downloadable files on the answer.

Set optional adapters in the environment of the managed service and restart it after changing the configuration.

| Feature | Configuration |
| --- | --- |
| Local MCP | Set `OPENCODE_NEXUS_MCP` to comma-separated names from `mcp.servers` in the paired project’s OpenCode configuration. |
| Nexus MCP | Set `OPENCODE_NEXUS_MCP_IMPORTS` to a JSON array of imports containing `connection_public_id`, `tool_name`, and the callable `name`. |
| Browser | Set `OPENCODE_NEXUS_CHROMIUM` to the Chromium executable. The browser tools open an isolated profile per conversation. |
| ACP delegate | Set `OPENCODE_NEXUS_ACP_AGENTS` to a JSON map such as `{"reviewer":["acp-agent","--stdio"]}`. A child request for one-time permission is relayed to Nexus. |
| ACP editor | Configure the editor to run `opencode nexus acp` with the paired `NEXUS_URL` and its Human `NEXUS_MEMBER_TOKEN`. Use the paired project as the editor directory. |
| T3 | Set `OPENCODE_NEXUS_T3_URL`, `OPENCODE_NEXUS_T3_TOKEN` and `OPENCODE_NEXUS_T3_PROJECT` for a protocol-2 T3 service. Use `coding_work` to delegate to a provider instance and model. |
| Telegram | Set `OPENCODE_NEXUS_TELEGRAM_TOKEN` and comma-separated private chat IDs in `OPENCODE_NEXUS_TELEGRAM_CHATS`. Each allowed private chat has a durable conversation and can send text, photos, documents, audio or voice attachments up to 16 MiB. Use `/approve`, `/deny`, `/answer` or `/stop` when needed. |
| Extensions | Set `OPENCODE_NEXUS_EXTENSIONS` to a JSON array of absolute paths to installed JavaScript modules. Each default export implements `NexusExtension` from `@opencode/nexus-runtime`. The registration receives the project directory and service shutdown signal. |

Manage a conversation's schedules or workspace memory using a command object. For operations that require a workspace manager, set `NEXUS_URL` and `NEXUS_MEMBER_TOKEN` to use that Human's permissions. For example, `opencode nexus manage --json '{"action":"memory.create","name":"Team notes"}'` creates a collection. Schedule commands take the owning conversation ID. Creating a schedule takes a stable request key, prompt and once, interval or daily rule. Document updates use the ID and version from the preceding read.

## Standalone browser development

Run `bun install` from the monorepo root. The bridge and service share the packaged Nexus SDK from `packages/nexus-runtime/vendor`. Pair the managed OpenCode service, then set these values in this package’s ignored `.env.local`.

```dotenv
NEXUS_URL=https://nexus.example.com
NEXUS_MEMBER_TOKEN=<human-member-token>
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false
```

Run `bun run dev` in this package and visit [the local chat](http://localhost:4779/). For a production preview, use `bun run build` and `bun run serve`. Set `OPENCODE_SERVICE_FILE` when using a nondefault service registration. Keep tokens and service credentials out of `VITE_*` variables.

When reusing a service paired in SigmaAgents, set `NEXUS_URL` to that service’s Nexus origin and
`OPENCODE_SERVICE_FILE` to its registration, such as `<state-home>/opencode/service-eric_dev.json` for a dev
build. The standalone bridge defaults to `service.json`; a healthy pairing in the desktop does not configure the
standalone bridge automatically.

## Conversation behavior

- **Recent sessions** searches and pages through either active or archived root conversations in the current workspace. The header shows the conversation title, runner and status; **Conversation actions** renames, archives or restores it. Archived and channel-owned chats cannot receive new messages here.
- The new-chat draft and each conversation’s draft, send choices and uncertain submission receipt are stored separately under the Nexus origin, Human, workspace and answering agent. Switching chats or reloading never resubmits a message. A deliberate retry uses the original input and mutation keys.
- **Run settings** selects a runner for a new chat, the configured answering model or an explicit model, and a permission policy. During a reply, Enter steers by default; choose **Queue after reply** for separate work. Ctrl/Cmd+Enter sends an immediate steer, or promotes the latest waiting steer when the editor is empty. The pending label follows the delivery mode Nexus accepted.
- The timeline retains the latest **nine** user dialogs. Streamed text and reasoning follow their answer variant. A background receipt or context summary is a disclosure, not another user dialog. Reconnecting reads the durable history and pending work again.
- **Activity** shows in-progress runs, steps waiting for attention, child conversations and communication links. Pause or resume a run, retry or abandon a failed step, or stop a branch. **Stop all work** uses the conversation cancellation command, including background work after the visible reply ends. Expand **Tools and activity** under an answer for recorded rounds, task output, captures and sealed model requests.
- The decision dock accepts typed answers or one-time approvals. For a held native `web_fetch` call, a Human with verified write access can also allow that site until the OpenCode service restarts. The service derives the site rule from the held call.
- **Usage** separates the cumulative request, token and cost totals from the latest reported context window and actual model. When some requests have no price, the amount is a **known subtotal**.
- Files belong to a particular answer variant or task. Download published files, preview Markdown and images, or open a recorded Git patch and add a line comment to the current draft. Explicit file paths in an answer are resolved on its conversation runner within the bound output directory; a bare filename in prose does not create a file card.
- **Code mode** and **Subagent** in **Run settings** control the tools available to future replies in that chat. A new draft starts with the runtime’s defaults; an existing chat saves a switch immediately. Changes leave running replies and prepared retries alone. The native runner uses OpenCode’s Code mode sandbox.
- After verifying Human write access, the bridge asks the selected runtime for its tool list and executor contexts, then seals them into the send ticket. An empty list means no tools; omitted contexts stay inherited. If the runtime cannot prepare a policy, no new input is sent.
- Browser file uploads, queue reordering, undo and export remain outside this integration. The source-controlled `manageModels` policy and the embedding host’s document-title control through `SET_DOCUMENT_TITLE` remain in place.

## Code Layout Parity Review

7777 owns the Nexus integration. Its compact header menus, result disclosures and decision dock provide the compact desktop interface.

| Boundary | Responsibility |
| --- | --- |
| `server/` | Loopback middleware; Human/workspace and channel ownership checks; scoped chat writes, conversation mode reads and updates, policy-bound send tickets, realtime subscriptions, execution inspection, and variant-bound artifacts and reviews. |
| `src/nexus/` | Browser transport, per-conversation drafts, turn projection, delivery and mode controls, typed decisions, usage, activity and output views. These adapters consume Nexus data rather than the main app’s OpenCode runtime. |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact header, bounded timeline, paged recent picker and composer. Shared timeline, Markdown, file review, line comments, dialogs and controls come from public `@opencode/session-ui` and `@opencode/ui` exports. |

The Nexus connection notice stays in `session/screen.tsx`. Reconnect keeps a disabled connecting control visible
through the request and reports each manual attempt through the shared toast component, including repeated failures.

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

To exercise a paired packaged service against a Nexus development deployment, select `dev/mock-priced`, set the server-only environment variables above and run `bun scripts/native-smoke.ts path/to/test-fixture.txt` from this package. It creates test conversations, verifies the recorded Human and answering agent, reads the supplied fixture and restores a newly created test file through its answer review.

For a live check, send a short text prompt, watch the streamed reply, reload, then open a fresh draft and reopen the completed chat from Recent sessions. Browser network inspection should show chat requests and an event stream under `/api/7777`. The Nexus acceptance event identifies the Human author and the turn identifies the paired agent as the answerer.
