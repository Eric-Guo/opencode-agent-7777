# Nexus UI

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

For Human platform sign-in, use `opencode nexus login`, open the printed browser URL, then run `opencode nexus account`. Use `opencode nexus logout` to revoke that session. The service completes PKCE on a temporary loopback callback. The bridge uses the signed-in Human member credential when no explicit Human token is configured. Tokens stay in the host; the renderer receives only the scoped bridge API. Browser and device-code sign-in are also available under **Settings & account**.

## Native tools and integrations

The selected project supports file reads, edits, filename and content search, shell commands, attachment import and publication, public web reads and a conversation-owned interactive terminal. File writes and edits retain checkpoints across service restarts. Shell reviews use OpenCode Git snapshots where the selected project supports them. **Restore files changed by this step** restores the recorded paths and refuses to overwrite later changes to them.

Code Mode runs confined JavaScript with the tools declared for the input. Child tool calls go through Nexus and use the same runner binding and approval policy.

The web reader converts HTML to Markdown. Binary responses and full text that exceeds the inline limit are available as downloadable files on the answer.

Set optional adapters in the environment of the managed service and restart it after changing the configuration.

| Feature      | Configuration                                                                                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local MCP    | Set `OPENCODE_NEXUS_MCP` to comma-separated names from `mcp.servers` in the paired project’s OpenCode configuration.                                                                                                                                                                                        |
| Nexus MCP    | Set `OPENCODE_NEXUS_MCP_IMPORTS` to a JSON array of imports containing `connection_public_id`, `tool_name`, and the callable `name`.                                                                                                                                                                        |
| Browser      | Set `OPENCODE_NEXUS_CHROMIUM` to the Chromium executable. The browser tools open an isolated profile per conversation.                                                                                                                                                                                      |
| ACP delegate | Set `OPENCODE_NEXUS_ACP_AGENTS` to a JSON map such as `{"reviewer":["acp-agent","--stdio"]}`. A child request for one-time permission is relayed to Nexus.                                                                                                                                                  |
| ACP editor   | Configure the editor to run `opencode nexus acp` with the paired `NEXUS_URL` and its Human `NEXUS_MEMBER_TOKEN`. Use the paired project as the editor directory.                                                                                                                                            |
| T3           | Set `OPENCODE_NEXUS_T3_URL`, `OPENCODE_NEXUS_T3_TOKEN` and `OPENCODE_NEXUS_T3_PROJECT` for a protocol-2 T3 service. Use `coding_work` to delegate to a provider instance and model.                                                                                                                         |
| Telegram     | Set `OPENCODE_NEXUS_TELEGRAM_TOKEN` and comma-separated private chat IDs in `OPENCODE_NEXUS_TELEGRAM_CHATS`. Each allowed private chat has a durable conversation and can send text, photos, documents, audio or voice attachments up to 16 MiB. Use `/approve`, `/deny`, `/answer` or `/stop` when needed. |
| Extensions   | Set `OPENCODE_NEXUS_EXTENSIONS` to a JSON array of absolute paths to installed JavaScript modules. Each default export implements `NexusExtension` from `@opencode/nexus-runtime`. The registration receives the project directory and service shutdown signal.                                             |

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

The UI and managed service must use a matching API revision. A ready connection from an older
service does not provide newer management commands; use a matching development build when testing changes.

## Conversation behavior

- Workspace, conversation, Bot, plugin and management links are kept in the URL fragment. Reload, Back and Forward restore that view; the embedding host's path and query stay intact. The current workspace is remembered in this browser. A new workspace opens immediately without changing the service default. Leaving the page closes its streams; returning from the back/forward cache reconnects the same conversation.
- **Recent sessions** searches and pages through either active or archived root conversations in the current workspace. The header shows the conversation title, runner and status; **Conversation actions** renames, archives or restores it. Archived and channel-owned chats cannot receive new messages here.
- Human read-only access disables sending, conversation edits and execution controls. Losing access closes the live stream and disables further writes while retaining the unsent draft. Restoring an archived conversation remains available to a Human with full access.
- The new-chat draft and each conversation’s draft, send choices and uncertain submission receipt are stored separately under the Nexus origin, Human, workspace and answering agent. Switching chats or reloading never resubmits a message. A deliberate retry uses the original input and mutation keys.
- New chats leave their title to the runtime's existing automatic-title policy. The selected conversation rereads authoritative HTTP state every three seconds, alongside realtime updates, so idle title, access and execution changes recover without a stream event. Leaving the conversation or losing access stops those reads.
- **Run settings** selects a runner for a new chat, the configured answering model or an explicit model, and a permission policy. During a reply, Enter steers by default; choose **Queue after reply** for separate work. Ctrl/Cmd+Enter sends an immediate steer, or promotes the latest waiting steer when the editor is empty. The pending label follows the delivery mode Nexus accepted.
- The timeline initially shows the latest **nine** user dialogs. **Load earlier messages** expands that window; a refresh preserves the loaded pages. Streamed text and reasoning follow their answer variant. A background receipt or context summary is a disclosure, not another user dialog. Reconnecting reads the durable history and pending work again.
- **Activity** shows in-progress runs, steps waiting for attention, child conversations and communication links. Pause or resume a run, retry or abandon a failed step, or stop a branch. **Stop all work** uses the conversation cancellation command, including background work after the visible reply ends. Expand **Tools and activity** under an answer for recorded rounds, task output, captures and sealed model requests.
- The decision dock accepts typed answers or one-time approvals. For a held native `web_fetch` call, a Human with verified write access can also allow that site until the OpenCode service restarts. The service derives the site rule from the held call.
- **Usage** separates the cumulative request, token and cost totals from the latest reported context window and actual model. When some requests have no price, the amount is a **known subtotal**.
- Files belong to a particular answer variant or task. Download published files, preview Markdown and images, or open a recorded Git patch and add a line comment to the current draft. Explicit file paths in an answer are resolved on its conversation runner within the bound output directory; a bare filename in prose does not create a file card.
- **Memory bindings** shows resolved sources and edits the sources for future replies. Automatic restores the default selection; Disabled selects no memory; Custom chooses up to sixteen named scope or collection bindings with read or read/write access and optional conversation or speaker subjects. Collections page without losing the draft. The server retains authority over access, and channel-owned, archived and read-only conversations keep a read-only view.
- **Code mode** and **Subagent** in **Run settings** control the tools available to future replies in that chat. A new draft rereads the runtime’s defaults and Code Mode availability; an existing chat saves a switch immediately. Changes leave running replies and prepared retries alone. The runner uses OpenCode Code Mode’s supported JavaScript subset and native results. Nexus owns child tool calls and their approvals; old Rho JavaScript bindings require new work after upgrading.
- After verifying Human write access, the bridge asks the selected runtime for its tool list and executor contexts, then seals them into the send ticket. An empty list means no tools; omitted contexts stay inherited. If the runtime cannot prepare a policy, no new input is sent.
- Browser file uploads, queue reordering, undo and export remain outside this integration. The source-controlled `manageModels` policy and the embedding host’s document-title control through `SET_DOCUMENT_TITLE` remain in place.

Scheduled jobs show their rule, next run, latest execution and paged execution history. Finished jobs and
read-only conversations retain history without mutation controls. The model selector preserves a saved model
as options arrive, and editing another field leaves its captured model controls alone.

An unconfirmed Nexus deployment upgrade retains its checked images, backup choice and request key in this tab's
session storage, scoped to the Nexus origin and Human. Reload and progress reads recover receipts without
submitting an upgrade. A deliberate retry sends the original payload and key. Confirmed receipts clear that
pending intent; a changed backup choice requires a new check.

The [Rho WebUI review](docs/rho-webui-parity.md) maps the reference behaviors, regression coverage and live checks.

## Code Layout Parity Review

`src/nexus/navigation.ts` owns fragment navigation and page lifecycle for the embedded Nexus interface.
`src/nexus/memory-bindings.tsx` owns the conversation memory editor; `server/memory.ts` validates its scoped writes.
Management pages and their drafts are recreated when the authenticated workspace scope changes.
`server/activity.ts` retains structured task output for the local `src/nexus/activity.tsx` disclosure,
including Code Mode's false, zero and null selections alongside ordered printed output.
`src/session/commands/export-session.tsx` owns downloads from `/export` and the session header.
The Nexus bridge in `server/export.ts` converts the retained conversation's diagnostic stream into a JSON array,
including records beyond the nine-dialog view. Human members with read access can export the conversation.

7777 owns the Nexus integration. Its compact header menus, result disclosures and decision dock provide the compact desktop interface.

Animated presence follows the main app's `runtime/{presence-machine,presence,animated-presence}.ts` boundaries
with local implementations. Pure transitions own visibility, retained values and minimum-duration attempts;
the driver owns DOM listeners, reduced-motion observation and bounded CSS exit timers. Reappearance, replacement
elements, identity changes and disposal retire previous exit work. Immutable snapshots stay outside Solid stores.
The retained attachment menu uses the compact-only `shell/commands/menu-dismiss{,-machine}.ts` adapter to bound
close-before-action work at 600 ms while preserving the two-frame focus-settlement delay after detachment.
Each gesture captures its original element and opening attempt, so reopening, draft/session replacement and
disposal cancel stale callbacks. Browser-enabled test helpers live in `src/test/browser.ts`, independently of
the removed OpenCode runtime. Existing public UI controls and styles remain reusable without parent-package edits.

| Boundary                                                     | Responsibility                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`                                                    | Loopback middleware; Human/workspace and channel ownership checks; scoped chat writes, conversation mode reads and updates, policy-bound send tickets, realtime subscriptions, execution inspection, and variant-bound artifacts and reviews. |
| `src/nexus/`                                                 | Browser transport, per-conversation drafts, turn projection, delivery and mode controls, typed decisions, usage, activity and output views. These adapters consume Nexus data rather than the main app’s OpenCode runtime.                    |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact header, expandable timeline, paged recent picker and composer. Shared timeline, Markdown, file review, line comments, dialogs and controls come from public `@opencode/session-ui` and `@opencode/ui` exports.                        |


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
when content grows. The compact screen owns the viewport and resume control and initially renders nine dialogs, with explicit earlier-history expansion.

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

Recent-session loading follows `home/sessions/{index,queries,load-machine}.ts`. The index retrieves Nexus conversation
pages and filters titles, IDs and duplicates. Each visible page has one 30-second deadline across any cursor reads
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

## Administration

The toolbar selects a workspace independently of the installation default. **Workspaces**
creates a private workspace or saves the default for future conversations. Existing
conversations and scheduled executions keep their original placement.

- **Bots** manages audience, Preset, home workspace, welcome message and current/history
  conversations. Personal current conversations accept input through the shared Bot
  admission owner. External Bots remain controlled by their owning ingress and keep
  their saved audience. New conversations require an available Home Workspace;
  unavailable saved Home Workspace selections remain visible in the editor.
- **Presets** preserves inherited versus explicitly empty model/tool selections, imports
  and exports Markdown or JSON, chooses defaults and publishes subagent roles.
- **Schedules** supports once, interval and daily rules, time zones, Ask/Rules/Bypass,
  versioned edits, pause/resume/cancel, immediate execution and execution links.
- **Plugins** shows activation diagnostics, commands, tools and dependencies. Schema fields
  retain saved secrets until explicitly replaced or cleared. Managed packages support
  install, check, activate, rollback and disable.
- **Integrations** provides Telegram Connections, Bot routing/access/delivery controls,
  MCP catalogs and OAuth, and T3 service, provider-login and project setup.
- **Settings & account** owns Human login, pairing, persona, conversation defaults and
  memory review. Member-token connections can read defaults without a platform login;
  persona editing requires the linked Human's platform account. Refresh connection
  preserves the selected workspace and conversation. **Providers** uses Nexus administrator authority for definitions,
  credentials, discovery, visibility, availability and explicit model tests.
- **Updates** checks Nexus deployment requirements and submits a checked candidate using
  an idempotency key. Progress reads never resubmit the upgrade. Host updates use OpenCode's
  existing updater. **Terminals** creates approved runner tasks and attaches to existing
  shells, including terminal tasks in conversation activity. Conversation terminals
  require Human write access for signaling; a viewer detaches when that access is lost.

`manageModels` remains host-controlled source configuration. `BridgeConfig.allowBypass`
can prohibit Bypass while leaving Ask and Rules available. Optional `iceServers` in the
bridge configuration supplies WebRTC ICE servers for terminal viewers.

## Extension UI modules

A runtime extension registers a local module directory during activation:

```ts
async register(api) {
  await api.registerWebUI("/absolute/path/to/webui")
}
```

Managed package manifests can instead set `"webui": "webui"`. The directory contains
an ES module named `index.js`; relative imports and assets resolve beneath the same
versioned directory. Assets cannot traverse out of that directory, including through
symlinks. The runtime serves only the currently active version.

```ts
export function register(ui) {
  ui.slots.register("settings.section", { id: "example", order: 20 }, () => {
    const element = document.createElement("p")
    element.textContent = "Extension settings"
    return {
      element,
      dispose() {
        element.remove()
      },
    }
  })
}
```

The typed contract lives in `src/management/modules.ts`. Slots include `main`,
`sidebar.panellist`, `settings.section`, `bots.item.config`, `plugins.item.config`,
`dock.tab`, `task.detail` and `conversation.header.utilities`. Lowest priority wins
within a slot/id cell; equal priorities are rejected. Contributions can update and
clean up their DOM. The module's AbortSignal ends on disable, replacement, workspace
change or shutdown. Commands use the scoped bridge and cannot export host credentials.

## Code Layout Parity Review: management

Management pages and extension lifecycle are owned by `src/management`; their
service bridge boundaries live in `server/management.ts`, `server/setup.ts` and
`server/terminal.ts`. These Nexus-specific surfaces stay in this package instead of
promoting adapters to the main app. Shared controls, session rendering and theme
primitives continue to come from the existing public UI packages. Built-in Coding,
Checkpoints and Lifecycle hook settings use the same Plugins form; atomic hook
groups are edited as complete JSON objects, following the runtime descriptors.

Run `bun run test`, `bun run typecheck`, `bun run build` and `bun run test:components`
from this package. The nested repository's CI checks out a matching OpenCode workspace
and runs the same gates with isolated Chromium. Set the repository's `OPENCODE_REF`
variable (or the manual workflow input) to the matching host revision when coordinating
changes across these two repositories; its default is `dev`. Browser fixtures never
use a live account or replace the user's running service.
