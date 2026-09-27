# @opencode/plm-meeting

This is the `plm-meeting` branch of the same repository as the sibling `7777` checkout. It builds its own
SolidJS/Vite renderer, including the recorder control and transcription flow.

## Meeting renderer

- `bun run build` builds this checkout into its own `dist/`. The build safely removes a legacy link to `../7777/dist`.
- `bun dev` serves this checkout on port 4778; `bun run serve` previews its own production build.
- `bun run build:shared` builds both branches into `dist-shared/` with common dependencies and named HTML entries.
- The desktop extension packages its HTML under `sigma-agents/` and merges `assets/` with the desktop renderer's assets. Tabs load `sigma-agents/plm-meeting.html` and `sigma-agents/7777.html`.
- `ELECTRON_PLM_MEETING_RENDERER_URL` selects the meeting development server independently of `ELECTRON_7777_RENDERER_URL`.
- The `plm-meeting` entry in `<repo-root>/packages/desktop/resources/thape-config/sigmaagents.jsonc` supplies the agent
  identity, welcome content, and independent session/draft storage keys. Its server profile is `agents/plm-meeting.md`
  in that configuration directory.

Keep meeting interface changes in this branch. The remaining sections describe the compact interface and its
standalone defaults; desktop initialization supplies the meeting agent identity.

## Set up both agents on a new developer machine

Install Git and the Bun version specified by the OpenCode root `package.json`. Start with the OpenCode distribution
checked out at `<repo-root>`, including its `.gitmodules`. The agent repository's configured remote must contain both
`main` and `plm-meeting`; publish the renderer changes on both branches before setting up another machine.
The distribution must also include the updated desktop-tab extension, both entries in
`packages/desktop/resources/thape-config/sigmaagents.jsonc`, and the `agents/plm-meeting.md` server profile.
Uncommitted changes on an existing machine are not transferred by these commands.

Initialize the distribution's existing submodules. Their repository URLs come from `.gitmodules`:

```bash
cd "<repo-root>"
git submodule update --init --recursive -- packages/7777 packages/desktop-tab packages/desktop/resources/thape-config
```

Use `packages/7777` as the primary worktree on `main`, then add a linked worktree for the published `plm-meeting`
branch. Run this once on the new machine, with `packages/plm-meeting` absent:

```bash
cd "<repo-root>/packages/7777"
git fetch origin
git switch main
git merge --ff-only origin/main
git worktree add --track -b plm-meeting ../plm-meeting origin/plm-meeting
git worktree list
```

The resulting layout is:

```text
<repo-root>/packages/
  7777/          # main; owns the 7777 renderer source and build
  plm-meeting/   # plm-meeting; owns the meeting renderer, including recording controls
  desktop-tab/  # desktop extension that loads both agents
  desktop/      # original desktop host and its separate renderer
```

Both agent worktrees share Git objects and remotes, while their branches and working files remain independent.
If the local `plm-meeting` branch already exists, use `git worktree add ../plm-meeting plm-meeting` instead of creating
it with `-b`. If `origin/plm-meeting` is missing, publish that branch from the existing machine first; creating it
from `main` alone will not include its meeting UI or its distinct `@opencode/plm-meeting` package name.
Submodule updates can detach `7777` at the distribution's recorded commit; switch back to `main` when resuming
renderer development.

Install workspace dependencies after both worktrees exist, then build both renderers and the desktop shell:

```bash
cd "<repo-root>"
bun install
cd packages/desktop-tab
bun run build
```

That build compiles both branch entry points together into `plm-meeting/dist-shared/`, then builds the desktop shell.
The extension packages its HTML entries under `sigma-agents/` and merges its `assets/` directory with the desktop's.
The tabs load `sigma-agents/7777.html` and `sigma-agents/plm-meeting.html`, sharing dependency chunks while retaining
each branch's UI. Identical fonts, images, and WASM assets share one packaged copy with the desktop renderer.
Agent identity and session/draft keys still come from `sigmaagents.jsonc`. Run `bun run build:shared` in
`packages/plm-meeting` to rebuild only this common distribution; deploy the entire directory so both HTML pages
can load their shared chunks. The original desktop renderer remains a separate build.

With `OPENCODE_DESKTOP_EXTENSION` exported to the desktop-tab checkout, `bun run build` from `packages/desktop`
also rebuilds this shared distribution automatically. No separate renderer build is needed before packaging.
Follow [Adding another Sigma agent](../desktop-tab/README.md#adding-another-sigma-agent) when extending the shared
renderer list or reusing an existing UI for another configured agent.

Each checkout's `bun run build` still produces its standalone `dist/index.html`. These standalone outputs are
not packaged by the desktop extension. Do not copy `dist`, `dist-shared`, or `node_modules` from another machine.
The meeting standalone build safely removes the old `dist -> ../7777/dist` link before building its own output.

To run the desktop shell with both configured agents, use the extension's development command:

```bash
cd "<repo-root>/packages/desktop-tab"
bun dev
```

For renderer hot reload, run `bun dev` from `packages/7777` (port 4777) and `packages/plm-meeting` (port 4778)
in separate terminals, then start desktop-tab with:

```bash
ELECTRON_7777_RENDERER_URL=http://localhost:4777/ ELECTRON_PLM_MEETING_RENDERER_URL=http://localhost:4778/ bun dev
```

Each tab uses its own development server; an unset variable loads that tab's bundled HTML. For a desktop build,
run `bun run build` from `packages/desktop-tab`; it builds and packages both renderers. Keep meeting UI changes,
including the recorder, in `packages/plm-meeting`, and 7777 UI changes in `packages/7777`. Agent-specific identity,
welcome content, storage keys, and prompts remain in the distribution configuration.

## Develop

```bash
# read <opencode-state-folder>/service.json
export OPENCODE_SERVER_PASSWORD=here
# field url in service.json
export VITE_OPENCODE_SERVER_PORT=4096
export VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false
bun run dev
```

Run the checks from this repository:

```bash
bun test
bun run typecheck
bun run build
```

`bunfig.toml` loads `src/test/preload.ts` only for tests. It compiles imported JSX with Solid's hyperscript runtime
for the headless logic suites, preserving Solid's default and `--conditions=browser` module resolution. No
`BUN_OPTIONS` override is needed. Development and production rendering still use Vite's Solid compiler.

### Browser verification

Keep the existing app and dev server running during verification. With Codex browser automation, select the
existing meeting tab through the documented API:

```javascript
await cua.getState()
const tab = await cua.getTab({ url: "http://localhost:4778/" }, { browser: "iab" })
await tab.getScreenshot()
```

Renderer smoke verification requires the selected tab's accessibility state and a screenshot showing the meeting
UI. Browser inventory only confirms that the tab exists. Exercise recording, transcription, and other interactions
separately when verifying those behaviors.

## Direct Integration (Without an iframe)

The app can mount directly inside another SolidJS web application. Add this package's source to the target
application's workspace, use the same `solid-js` version for both applications, and make `solid-js/web` available to
the target application's bundler. The target Vite configuration must also support this package's `@` alias,
Tailwind plugin, and workspace dependencies; `vite.config.ts` is the reference configuration.

Add the dedicated mount element where the agent should appear. Its parent must provide a usable height:

```html
<div id="oc-agent" style="height: 100%"></div>
```

Then import the package entry once from the target application's client entry:

```ts
import "<repo-root>/packages/7777/src/entry"
```

`src/entry.tsx` finds `#oc-agent`, loads the package styles through `src/app.tsx`, and mounts the SolidJS application.
Load the entry after the mount element exists; it intentionally does nothing when `#oc-agent` is absent. The target
application must also serve this package's `public/` assets at its public root.
The package-owned rules in `src/index.css` are scoped below `#oc-agent`; the shared Tailwind and OpenCode UI styles
remain global. Configure the target application's `/api` route or development proxy to reach the OpenCode server,
matching the proxy setup in `vite.config.ts`.

The `activateInElectronOnly` build option defaults to `true`, so the entry mounts agent7777 only in Electron. This
prevents a copied `dist/` bundle from issuing OpenCode API requests when it is loaded by a normal browser. To build
agent7777 for direct standalone browser use, disable the option at compile time:

```bash
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
```

Electron-flavoured WeCom/WeChat user agents are treated as normal browsers, so they also require the standalone build
option.

When hosted in a desktop external tab, the app reads the tab's `localAgent` value from desktop initialization and uses
it as the OpenCode agent ID for session creation, agent switching, and optimistic messages. If the desktop tab does
not provide a value, the standalone app defaults to `7777`.

Desktop tabs can share one copy of this renderer bundle and configure their current-session and draft persistence
through `storageKeys` in their `sigmaagents.jsonc` entry:

```json
"storageKeys": {
  "sessionID": "opencode.7777.session.id",
  "sessionDirectory": "opencode.7777.session.directory",
  "promptDraft": "opencode.7777.prompt.draft"
}
```

These values preserve the existing 7777 session and draft. Give another agent three different keys to keep its saved
session and draft independent while reusing the same `7777/index.html`. Desktop initialization supplies the keys
before session restoration or composer persistence. Old hosts that omit `storageKeys` and standalone deployments
use `src/new-session/agent-default-config.json`, whose defaults retain the existing keys. Changing a key selects a
different entry without migrating or deleting existing data. Model/UI preferences and accepted-prompt history are
unchanged by this configuration.

## Open Source Notes

This package should not depend on a contributor's local home directory or private company resources. Use
`<repo-root>` in documentation when referring to the monorepo checkout, and keep private agent prompts, internal
network paths, credentials, and localStorage dumps out of commits.

The production/private 7777 agent prompt is not included verbatim. A sanitized reference template lives at
`docs/reference/7777-agent.md`; copy and adapt it for a local OpenCode agent configuration if needed.

## Code Layout Parity Review

`scripts/build-shared.ts` owns the compact agents' shared distribution build. It is maintained on `main`
and inherited by `plm-meeting`; either sibling checkout can run `bun run build:shared` to write its own
`dist-shared/`. It preserves branch-local imports and standalone outputs while sharing dependencies.
The desktop extension packages its HTML under `sigma-agents/` and merges `assets/` with the desktop renderer's assets. Tabs load `sigma-agents/plm-meeting.html` and `sigma-agents/7777.html`.

The review-source assessment uses parent `3064ac5302`, including the GUI extension split. Matching local filenames are
not shared imports: see the parity table for actual public exports and the remaining compact responsibilities.
7777 is an independent Git repository. Refactors use this checkout's behavior and public shared-package exports;
they do not rely on `packages/app` source.
File URL encoding uses `@opencode/util/path`; URL composition and directory search remain local.
The embedding host's payload schemas and `DesktopAPI` contract live in `runtime/platform/desktop-api.ts`.
Ambient window declarations, header identity types and the lazy RPC adapter derive their payload types from those
Effect schemas, including mutable arrays and optional host capabilities. This compact-only contract replaces
duplicated preload declarations; it does not import the main app or desktop package. The adapter retains the
structured-clone protocol, legacy initialization fields and native `ArrayBuffer` results, and omits absent picker
options when encoding requests. Browser consumers use type-only imports, keeping the RPC transport lazy.
`shell/routes/session-ui-provider.tsx` follows the main app's session UI provider boundary and supplies the shared
Markdown renderer's local-file callback. In the desktop host, file links open through `FilesOpenPath` in the system's
default application (for example, Excel for `.xlsx`); relative paths resolve against the current session directory.
The compact provider reports native opening errors through a toast and leaves browser-only file links inert.
Session labels share `@opencode/util/session-title-fallback`, with a local wrapper preserving the recent-session
agent fallback for absent titles. `composer/comment-note.ts` owns one compatibility reader for legacy comment and
prompt-presentation metadata; its selection type comes from the local editor types. Both preserve existing behavior.
Provider/model views in `runtime/server/types.ts` reuse public `@opencode/client/promise` fields, including capability
arrays. `runtime/server/global-sync/utils.ts` only adapts picker data: provider grouping, separate catalog/API IDs,
cost selection and variants. Unused legacy configuration fields and synthetic capability flags are removed. Capability
arrays are copied at the adapter boundary so Solid stores cannot mutate shared client catalogs; the tooltip retains its
existing modality order and omits unknown reasoning support. These files keep the main app's boundaries with local code.

Timeline scrolling follows the main app's `session/timeline/interaction.ts` boundary. The screen now uses the same
public `ScrollView` from `@opencode/ui/scroll-view` for its focusable viewport, keyboard navigation, nested-scroll
ownership, and draggable scrollbar. `createAutoScroll` from `@opencode/ui/hooks` still owns following streamed content,
pausing for reading or text selection, and overflow anchoring. The local adapter pauses on upward keyboard navigation
and uses the main app's arrival check so delayed scroll events cannot cancel that intent. Reaching the end or using
**Jump to latest** resumes following. Activation resets, viewport resize handling, existing spacing, and the nine-dialog
window remain. The compact screen owns the viewport and resume control; the main app places them in its virtualizer.

`session/timeline/message-timeline-compact.tsx` keeps the compact header's binary **Thinking** preference and maps it
to the shared timeline's `full`/`hidden` reasoning modes. Enabling Thinking shows thought contents expanded by default;
individual thought sections can still be folded. The main app's `session/timeline/controller.tsx` derives its mode
from the broader timeline-detail settings.

`session/timeline/markdown-echarts.tsx` is a 7777-only adapter over the public shared timeline. It observes assistant
response Markdown and adds interactive ECharts SVG charts without replacing the shared parser or code nodes.
ECharts is loaded only when a completed chart block is found. Charts resize with their containers and are disposed
when messages leave the timeline. **Show source / Hide source** reveals the original JSON; the existing copy button
always copies that source. Loading or rendering failures leave the source readable. Controls use English fallback
until translations are reviewed.
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

The header reuses the GUI extension's `ContextUsage` display through its public
`@opencode/gui-extensions/usage/context-usage` export. `session/header/session-context-usage-compact.tsx`
adapts the active session, latest reported assistant tokens, and model catalog without an extension host.
It follows the shared ring and tooltip behavior; the full app's context panel remains extension-owned.

The header's **Review turn changes** control reuses `@opencode/session-ui/session-review` in a lazy dialog.
It defaults to snapshot changes from the latest turn, with shared file accordions, counts, and split/unified diffs.
A shared selector adds working-tree, branch, and committed comparisons through the public `vcs.diff` API, scoped to
the active session's directory. Branch and committed comparisons share the base-reference form, applied on Compare
or Enter. Both start at the common ancestor with that base; branch review includes uncommitted changes, while committed
review ends at `HEAD` and excludes them. `review/parts.tsx` owns the title, description, and empty states, keeping mode
presentation out of the rendering/lifecycle panel. `review/model.ts`, `review/panel.tsx`, and `review/parts.tsx` follow
the review extension's boundaries in `packages/gui-extensions`; the compact-only `review/trigger-compact.tsx` supplies dialog mounting in place of the
main app's extension host. Reads use the current activation and existing event stream, refresh after completion,
revert or reconnect, and abort on source change, close or session change. VCS modes also coalesce workspace file events.
Errors can be retried and drafts are preserved. Staged-only review (unsupported by the current public API),
comments, arbitrary history ranges, and docked extension panels remain outside this compact view.

`runtime/server/runtime.ts` and `runtime/server/data.ts` follow the main app's separate orchestration and data-adapter
boundaries. The runtime owns the activation's disposable Solid root, cancellation, publication, refresh scheduling
and nine-dialog hydration. Hydration starts at 36 records and follows nonempty cursors until nine user/shell roots or
the end, excluding queued prompts. Hydration and the visible timeline share `session/session-domain.ts`'s dialog-root
predicate. The data adapter creates one `createData` instance from `@opencode/client/solid` inside that root, guards
session snapshots and owns the private pending-inbox receipt ledger. Shared data still owns durable session records,
messages, pending inbox snapshots and location catalogs.

`runtime/server/global-sync/session-cache-messages.ts` now owns the activation's message cache: cursor termination,
live-row reconciliation, optimistic echoes, cancellation tombstones and skill/selection compatibility. It receives
accessors from the data adapter and has no global runtime lookup. This compact-specific cache stays local because
the main app's data adapter has different mutation policies. The adapter batches cache and receipt changes with the
shared reducer so readers cannot observe half-applied transitions; HTTP receipts retire only when an acknowledging
snapshot or event arrives. Neither helper creates a root, timer or SSE connection. `runtime.test.ts` covers the combined
contract, including atomic inbox/transcript publication and mixed shell/user hydration. `session-store-compact.ts`
exposes reactive views plus local UI state; transport, directory request discovery and embedded behavior stay local.

`session/session-ownership.ts` captures the active request client, runtime, session ID and local agent together with
the activation check used by submit/interrupt, undo/redo, queue actions, and permission/form reads and replies.
It follows the main app's ownership boundary using the compact runtime's identity instead of a routed key watcher.
Mutations and follow-up refreshes use that captured runtime directly, removing global cache and refresh forwarding.
Returning to the same session with the same client still invalidates earlier results; disposal or changing the selected
ID before activation also rejects stale writes. The helper adds no subscriptions or cancellation policy. Existing consumer
tests retain coverage for draft restoration, request routing, pending flags, errors and successful prompt history.

`session/requests/sync-compact.ts` centralizes permission/question response handling and directory request grouping.
The permission and form adapters retain their public client endpoints, event filtering and child-session routing.
Replies keep the request visible until accepted, block duplicate submissions, preserve failures for retry,
and ignore results from an earlier activation even after returning to the same session. An older response
cannot clear a newer pending reply. Web-search forms retain their separate promise-based submission lifecycle.
This compact-only module replaces duplicated lifecycle code without depending on the main app or moving request
policy into the shared `session-ui` rendering library.

The question and permission docks adapt package-local `question-prompt.tsx` and `permission-prompt.tsx` widgets
under `src/session/requests/`. These widgets own answer selection, custom text, progress navigation, keyboard focus,
pending controls and permission decisions. Only the existing `@opencode/session-ui/dock-prompt` shell and styles
are shared. The main app keeps its own prompt implementations, including its question draft cache, collapse controls,
global shortcuts and viewport sizing. Compact widgets are not exported by `session-ui` or consumed by the main app.
The `session-question-dock.tsx` and `session-permission-dock.tsx` boundaries retain form-field filtering, label
fallbacks, compact translations and the existing callbacks. Each request mounts a fresh question widget.
Scalar/multiselect payloads, unanswered-field omission, custom-answer trimming and deduplication, Escape and
modifier-Enter behavior are preserved. Package-local browser fixtures render the production widgets; run
`bun run test:components` from this checkout to exercise them without a backend. Web-search setup and response
lifecycle policies also remain local.

Permission notification delivery follows the main app's `shell/notifications/notification.tsx` boundary with a
package-local controller. It owns translated copy, request-ID deduplication, desktop delivery and the browser fallback;
the request adapter selects the active tree's request and resets or retires notification IDs on refresh or reply.
Existing permission prompts, denial handling and refresh notifications are preserved. The compact shell has no
notification inbox, sound preferences or unread-session tracking. Integration coverage stays in
`session/requests/permission-sync-compact.test.ts` to verify delivery through the real request lifecycle.

See [Code Layout Parity Review](docs/code_parity.md) for the module-boundary comparison with
`<repo-root>/packages/app` and the intentional compact-app differences.

Persistence follows the main app's `runtime/persistence/storage.ts` and `runtime/server/persistence.ts`
boundaries with package-local implementations. The compact storage adapter is synchronous; drafts, history,
settings, language, and model/session preferences share it while retaining their existing keys and formats.
Model preferences, per-session choices, and accepted-prompt history use its local `persisted` store helper, following
the main app's storage boundary. Solid setters save synchronously without subscribing callers to serialized fields;
initial reads do not rewrite storage. Consumer-owned readers and writers retain recovery, limits, and error handling.
This compact helper stays in `storage.ts` because it has no separate asynchronous hydration or save scheduler.
Model preferences use the main app's `ModelState` schema boundary in `runtime/server/persistence.ts`; selection,
visibility and config types derive from those local schemas. Global and per-session model choices now share that
module's schema-based readers and writers, leaving session identity keys in `storage-compact.ts`. The compact-only
per-session format stays here rather than in the main app's `providers/models/selection.tsx`, so storage recovery
does not import the selection controller. Recovery preserves existing keys, extra legacy session/model fields,
partial config defaults, explicit Default variants, and independent mutable values while dropping invalid entries.
The local `Persistence.array` accepts a fresh fallback factory for compact provider defaults. Catalog and visibility
operations remain in `providers/models/models.tsx`. `providers/models/selection.tsx` owns shared scoped choices,
the persisted global fallback and server acknowledgement; it does not import the composer controller.

`composer/selection.ts` owns active model precedence, variant resolution and recent-model cycling, following the main
app's composer boundary. Both the editor and submit path use it. Unsent choices still precede the durable session
model and global fallback; explicit Default variants, agent defaults, hidden-model filtering and recency order are
preserved. Provider-owned choices and pending acknowledgements outlive individual composer instances. The moved
contracts live in `composer/selection.test.ts`, including cancellation of older sends after a newer selection is pending;
catalog fallback coverage remains in `providers/models/selection.test.ts`.

The model manager follows `providers/models/manage.tsx`, `providers/models/provider-group.tsx`,
`providers/catalog/console.ts`, and `settings/{list,row}.tsx`. Console integrations nest under an OpenCode Console
section with the workspace name; direct providers keep their own sections. The catalog adapter preserves
`integrationID` and `canonical` for grouping and icons. Workspace detection uses the full model catalog, so a search
that hides the root model retains the Console group. Sections collapse, expand during search, and restore their
previous state when search is cleared. The compact renderer reuses one header for all sections and keeps its existing
provider switches in nested groups. Switches affect the full catalog during search and retain visibility defaults
for future models. The selector and manager share their existing ordering through the local `providers/catalog/order.ts`.
The composer uses package-owned provider icons and restores editor focus after model selection or Escape. With
`manageModels` enabled, the selector stays available even when every model is hidden. Portal styles remain scoped
to the model dialog for embedded hosts. Provider connection flows remain unavailable.

The model selector now includes the main app's ChatGPT-plan footer. `providers/catalog/integrations.ts` owns optional
connection reads through the public client's shared location resource; `providers/models/select-dialog.tsx` renders
the result, and `runtime/platform/external-link.tsx` owns external-link behavior. With an OpenAI model selected, opening
the menu reads its active connection and shows **Using ChatGPT plan** and **Manage usage** for an OAuth credential.
API keys, environment connections, inactive OAuth credentials, and Console providers do not show the footer.
The compact adapter listens to the existing SSE stream while open and refreshes on connection changes or reconnect.
Failed or outdated reads hide the footer while model selection stays usable; reopening retries. The runtime aborts
integration reads with the activation. Model defaults, visibility, storage formats, and the `manageModels` gate stay
unchanged, and the footer is available when model management is disabled. No app imports or new dependencies are used.

Model picker headings now reuse `ProviderModelIcon` and the Console catalog helpers for short provider names and
workspace badges when the same provider is also connected directly. Label resolution uses the full catalog, so
search and visibility filtering cannot hide the workspace identity. This presentation logic stays in
`providers/catalog/console.ts`; free-model classification follows `providers/models/models.tsx`. Model management
uses the shared `TextInput` clear action, including its focus behavior, without a separate button or positioning CSS.
`providers/models/tooltip.tsx` keeps the compact layout used by the picker; the unused legacy layout and its provider
name heuristics are removed. Model tags, input ordering, optional reasoning information and locale-aware limits remain.

The model picker and compact recent-session search also use the public `TextInput`, and recent results use
`ScrollView`. Their existing `providers/models/select-dialog.tsx` and `home/sessions/view.tsx` boundaries retain
filtering, selection and focus restoration while the shared controls own field styling, clearing and scrollbars.
Recent-session search stays server-backed, with its combobox semantics, keyboard navigation and pagination;
its header popover intentionally differs from the main app's routed Home view.

Recent-session ordering, calendar-day grouping and display labels now live in `home/sessions/records.ts`, following
the main app's record boundary. Controllers and views no longer import the directory-sync adapter for presentation
helpers. The header region supplies the active agent's fallback title; record helpers remain independent of runtime
state. Activity ordering (including ID ties), local dates, invalid-date fallback, twelve-row pagination and full-history
search are preserved. The existing grouping and ordering tests now live in `home/sessions/records.test.ts`;
`controller.test.ts` retains coverage for selecting the latest record and rejecting stale selections.

Composer suggestion popups also reuse `TextInput` and `ScrollView` in `composer/editor/editor.tsx`.
The shared field owns command-search styling and clearing, and the shared viewport owns scrolling and its thumb.
Local code retains filtering, keyboard selection, focus restoration, draft preservation and boundary-based sizing,
including the 28 px search row and partial next-row hint. Inline slash commands and context suggestions use the
same viewport without adding a separate search field.

Queued-prompt undo follows the main app's `session/composer/{queue,queue-panel,controller}` boundaries.
The local implementation restores text, inline attachments, and file, agent, and skill mentions into the single
persisted draft. Historical and queued prompt reconstruction share the package-local `composer/prompt.ts`
boundary; the queue controller retains cancellation, draft merging, and activation guards. This shared local
restoration helper intentionally replaces the main app's separate queue conversion. Hidden context without a
mention and malformed queued mention ranges stay queued because the compact draft cannot preserve them.

`composer/prompt.ts` also owns conversion between the compact persisted draft and editor parts, following the main
app's prompt-conversion boundary. Draft restoration and attachment insertion share one attachment conversion;
`composer/state.ts` owns reactive state and change notifications. The compact URL/range storage format remains
local, including legacy blob IDs, absolute file URIs, mention validation, and isolated snapshots. Existing state,
prompt, submission, queue, revert, and persistence tests cover these conversions through their consumers.
One range validator now serves draft, message and queue restoration: drafts skip mismatches, historical display text
can relocate mentions, and queue undo rejects invalid context. Draft ties retain stored order; transport ties prefer
shorter ranges. Validation copies references before sorting and restoration keeps them isolated from mutable stores.

`composer/schema.ts` follows the main app's schema boundary for text, agent, skill, and inline attachment parts.
`composer/types.ts` re-exports their inferred types and extends the stored file reference with editor-only metadata,
removing duplicate field definitions. The compact draft and history formats retain their existing validation,
recovery, field order, and mutable decoded objects; file selections and source metadata remain editor-only.

Composer suggestions follow the main app's `composer/model.ts`, `composer/editor/`, `composer/suggestions/`, and
`composer/client-slash-command.ts` boundaries. The package-local `composer/catalog-compact.ts` reads commands, skills, and agents from the active
runtime's shared location resources and retains independent loading/failure states. Providers and models use the
same resources, with the explicit server-default-model read first and compact selection/visibility rules afterward. File search follows the
main app's `workspaces/files/model.tsx` and `workspaces/files/path.ts` boundaries with a package-local search controller
and URI helpers. It searches files and directories without file tabs or a workspace provider. File, skill, and agent
mentions persist in drafts and accepted-prompt history and retain their offsets in prompt and command requests.
Agent suggestions exclude hidden and primary-only agents. Local session actions enter through the composer adapter;
the broader app command provider remains unavailable.

Session JSON export follows `session/commands/{export,use-session-commands}` and
`composer/client-slash-command.ts`. The public client's `session.export` transfer API supplies the complete saved
transcript, independently of the compact timeline's nine-dialog window. The browser download uses the native
`{ info, messages }` transfer shape with pretty JSON and a safe title-based filename (falling back to the session ID).
The shared UI toast reports preparation, download initiation or failure; concurrent export requests are ignored
until the current one finishes. Local `/export` takes precedence over a same-named server command and never submits
a prompt or changes model/session settings. Inline execution preserves attachments; choosing it from the Add menu
preserves the existing draft and mentions. It needs no app imports, host command provider or native save dialog.

`composer/request.ts` derives transport fields from the public client's `SessionPromptInput`; prompt and slash-command
submission pass through that single payload builder. `composer/adapter.ts` reuses `SessionInboxDelivery` for queue/steer.
Draft schemas, trimming, mention offsets, file names/URIs, optional-field omission, and submission lifecycle stay local
and unchanged; no app source or additional dependency is needed.

`composer/editor/editor.tsx` owns editor presentation, attachments, menus, suggestions, and submit controls.
`composer/editor/dom.ts` owns DOM rendering, mention parsing, clipboard text insertion and cursor helpers.
Editor and attachment paste share line-ending normalization and native insertion. The editor keeps a single native
undo step for multiline text, escapes HTML, and falls back to replacing the selection with one text node and input
event. Attachment routing retains its file-first policy, native clipboard images and draft-based large-text fallback.
Caret reveal after paste also lives in this DOM boundary; the renderer only schedules it after insertion.
Caret reads, attachment capture, restoration, and focused re-rendering follow the
main app's handling of `<br>` line breaks and atomic mention pills. Restoration handles nested inline text and empty
drafts without placing the caret inside a mention. Literal zero-width characters remain part of the compact draft's
text and offsets.
Attachment capture keeps a stored draft cursor when available; otherwise it uses the selection start, including for
backward selections. An absent or external selection retains the attachment controller's zero-offset fallback.
DOM regression tests use a test-only `happy-dom` dependency; runtime code has no dependency on the main app.
Mention parsing preserves original metadata before updating content and offsets. File selections derive their line
fields from the public `@opencode/session-ui/comment-card` contract and retain local character offsets.
`composer/prompt-parts.ts` owns prompt text extraction, insertion, mention replacement, attachment removal and cloning.
Draft restoration, DOM parsing and accepted-prompt history share its text/mention builder and offset calculation;
editor actions use the same offset calculation while retaining separate text parts. The builder preserves UTF-16
positions, significant whitespace, empty drafts and mention metadata. DOM traversal and caret behavior remain in
`composer/editor/dom.ts`; retry handling and persistence notifications remain with state and editor actions.
History retains its normalization, deduplication, byte budget and stored format. This compact implementation stays in
the existing prompt-part boundary without app imports or new shared-package exports. Regression coverage includes
recalling and editing Unicode text beside file/agent mentions without changing the saved history or file metadata.

Suggestion sizing now follows the main app's `composer/editor/editor.tsx` boundary. The session screen passes its
timeline viewport through `session/composer/region.tsx` and `composer/composer.tsx`; the editor observes its height
only while a menu is open. Menus reserve visible conversation space, keep fixed-height rows and a partial next-row
hint, and adapt when the window, draft or request dock changes size. Search, keyboard selection, empty states and
draft contents retain their existing behavior. Missing or detached boundaries use the normal capped height.
This local implementation uses the browser's `ResizeObserver` without an additional dependency.

Attachment and file-comment removal share a local button in `composer/editor/editor.tsx`. It uses the public UI
package's `hover-reveal` utility, matching the main app's touch visibility, and also reveals the control on keyboard
focus. Mouse hover behavior, labels, removal callbacks, and hidden/disabled controls retain their existing behavior.

Image attachment previews use the public `@opencode/ui/image-preview` component, connected in `composer/model.ts`
through the editor's existing attachment callback, matching the main app's boundary. Thumbnails are named buttons
that open with a click, Enter or Space; the shared dialog handles dismissal and focus return. Previewing keeps the
draft intact and reads its existing inline URL. PDFs and text files keep their attachment cards and removal behavior.

Compact differences remain intentional: inline attachment URLs and file-type filtering,
file comments, disabled controls, optional queue editing, and provider icons.
The main app's upload progress, path attachments, and note cards remain outside this view.
All implementations stay package-local or use public shared-package exports.
Markdown parsing and sanitization dependencies belong to the shared UI packages; 7777 no longer declares unused
direct dependencies on `marked` or `dompurify`.

`runtime/platform/file-picker.ts` owns the compact attachment format policy used by the browser input, composer
picker/validation and desktop extension filters. Shared format entries supply MIME lists, native filters and image/PDF
filename fallbacks; bounded text-content detection also lives here. Declared MIME precedence, the JPEG filename alias
and existing picker filters are preserved. Exported lists are frozen and picker calls receive copies, avoiding mutable
options shared with the host. This policy stays local because the main app's attachment destination/upload behavior
differs; attachment handling remains in `composer/attachments/attachments.ts`.
That module now owns error reporting for picker, input, paste and drop operations, retaining files already added
when a later read fails. `composer/editor/interaction.ts` restores typing focus after picker completion or cancellation,
following the main app's attachment/editor boundaries. The Add menu reuses `shell/commands/menu-dismiss.ts` to wait
for its focus teardown; delayed completion checks the editor, session and dialog before restoring focus.
Inline URLs, supported formats, duplicate detection, draft storage and embedded drop scope remain unchanged.

File browsing follows the main app's `session/files/{file-tree-v2,file-tree-v2-model,open-in-app,
open-in-app-button,open-in-app-path,file-tabs,tab,session-side-panel}` and `workspaces/files/{model,tree-store,path,watcher}`
boundaries, using package-local implementations and the shared UI tree styles. The compact file model uses
`model.ts` because it receives the active workspace directly instead of rendering a context provider. The compact app intentionally
places the tree left of both the conversation and composer. File tab transitions follow
`shell/state/session-tabs.ts`, with local preview, open, and close operations. Tabs stay in memory for the active
workspace/server instead of using route-owned persistence; changing either scope or reloading clears them. `SHOW_FILE_TREE_PANEL` in `src/constants/session.ts` controls the entire feature and defaults
to `true`; set it to `false` to restore the full-width conversation. The tree follows the active session's
`location.directory`, including the default `<server-root>/agent-plm-meeting` folder and restored sessions.

The PLM meeting tree uses the main app's rounded raised panel and shared resize handle on its right edge.
Its width is saved in the compact preference storage under a PLM-specific key instead of the main app's layout
provider. Desktop widths range from 240 to 480 pixels, with smaller limits in narrow windows; the handle also
supports arrow keys and Home/End.

Expand folders, find files, refresh the tree, or drag files/folders into the prompt. Click a file to open an italic
preview tab; another file click replaces that preview. Double-click a file or its tab, or choose **Keep open**, to
retain it while browsing. The **Conversation** tab and **Back to conversation** keep open files available. Close a
file with its close button, a middle click, or **Delete** while its tab is focused. Closing the selected file opens
its left neighbor (or the right neighbor when it was first); closing the last file returns to the conversation.
Use **Left/Right Arrow**, **Home**, and **End** in the tab strip to switch tabs.

**Add to prompt** also inserts a file reference. File references survive draft reloads, history, undo, and submission.
Right-click a file or use its menu to copy its absolute path. Desktop hosts with local-server access also offer
opening files in the default app, revealing them in the file manager, and installed editor choices through the
same desktop RPC methods as the main app. Browsers retain preview and copy-path actions.

The compact preview supports source text, images, and PDFs. Text over 1 MiB and media over 25 MiB show a
placeholder; adding these files to the prompt or opening them externally remains available. Folder data is loaded
on expansion. Only the active file preview is fetched and rendered; switching back to a file reads its latest
contents. Pending reads are aborted and media URLs are released when leaving a preview. The existing session event stream delivers `filesystem.changed` updates to the active workspace's
loaded folders, search results, and open preview. Watcher invalidation follows the main app's file-model boundary,
with workspace filtering and a queued refresh for changes that arrive during a folder read.
Search requests rerun on watcher updates, but results can lag until the server refreshes its cached search index.

## Recent Sessions

Open **Recent sessions** in the header to browse other sessions in the active directory, grouped by local calendar
day and sorted by most recent activity. The list starts with 12 sessions; **Load more** fetches the next batch of 12
until the history is exhausted. Type a title to search the full server history in this directory, or paste a full
session ID to find it directly. Search results also support **Load more** and are not limited to sessions already
loaded. **Arrow Up** and **Arrow Down** select a result, **Enter** opens it, and **Escape** closes the popover.
Clearing the search or reopening the popover starts again with the first batch.

## Undo and Redo

Use **Undo** in the header to rewind the latest user turn and restore its prompt and attachments to the composer.
File, agent, and skill mentions remain structured references through editing, reload, and resubmission. Historical
file mentions retain their server URI, including any line range. If visible prompt text shifts a mention's offsets,
restoration searches for that mention in order; context absent from the visible text stays out of the draft.
Use **Redo** to restore one undone turn; redoing the final turn clears the revert boundary and composer. The existing
**Revert message** action uses the same controller, so a message-level revert can also be stepped forward with Redo.

These actions operate on the loaded history and are available when the session is idle, messages have finished
loading, and no follow-ups or requests are pending. Send or remove pending follow-ups before rewinding. The visible
history remains bounded to nine dialogs. Failed requests preserve the current draft and boundary; responses from a
previous session activation cannot overwrite the current session or its draft.

## Composer History and Follow-ups

Type **/** at the start of a prompt to search the active directory's server commands, or **@** to search its skills
and eligible agents. Hidden agents and agents restricted to primary mode are excluded.
Type a filename or path after **@** to also search files and directories in the active session directory (up to 50
results). File search cancels superseded requests and hides stale file results while the next query loads. Selected
files stay attached through edits, reloads, and prompt recall, retaining their original absolute server URI when
switching sessions. Sending includes their mention ranges and lets the server resolve the file or directory.
Use **Arrow Up/Down** to choose a result, **Tab** or **Enter** to insert it, and **Escape** to dismiss the menu.
The **+** menu also offers Commands and Context. Selected skills and agents stay attached when editing, reloading,
or recalling an accepted prompt. Sending a recognized `/command` invokes the server command with the remaining text
as arguments; unrecognized command text is sent as an ordinary prompt.

Use **/export** to download the current session as a `.json` file. Select the suggestion, or type `/export` and
press **Send**. The export includes the full saved transcript, including messages outside the visible nine-dialog
window, in `{ "info": ..., "messages": [...] }` format. It does not send a message to the model or include unsent
drafts and queued prompts. The command takes no arguments; extra text is kept in the composer for correction.
You can also choose **/export** from **Add → Commands** while keeping an existing draft.

With the message editor focused and its text empty, press **Arrow Up** to recall the latest accepted prompt.
At the start or end of a recalled prompt, **Arrow Up** and **Arrow Down** move through history; moving past the newest
entry restores the draft you had before recall, including attachments. Text selections, Shift+Arrow keys, and IME
composition keep their normal editing behavior.

History is shared across sessions in this browser and survives reloads. Only prompts accepted by the server are
recorded. The latest 100 entries share a one-million-character JSON budget (about 2 MB of localStorage); entries that
do not fit, including oversized inline attachments, are skipped. If storage is unavailable, history remains usable
in memory. Recalled prompts preserve file, skill, and agent mentions and inline attachments, and can be edited
without changing the saved entry.

Use the header's **Follow-up behavior** menu to choose **Steer** (the default) or **Queue** while a turn is running.
**Enter** uses that preference and **Cmd+Enter** on macOS, or **Ctrl+Enter** elsewhere, uses the opposite delivery.
When the session is idle, either shortcut sends immediately. The preference is saved in this browser; the composer
also shows the alternate action while a follow-up is ready to send.

Use **Undo** on a queued prompt to move it back into the composer. It appends after any current draft text and
preserves existing attachments and file, agent, and skill mentions. The prompt leaves the queue only after the server confirms
cancellation; failed requests leave both the queue and draft intact. Undo uses the full prompt text, including
notes hidden by a shorter queue preview, and restores file mentions from their queued bytes. Prompts containing
context without a mention, or invalid or overlapping mention ranges, stay
queued with an explanation. Editing in place and reordering queued prompts remain unavailable.

## Agent Welcome Content

The fallback local agent, welcome markdown, and suggested questions shown after clicking **New session** live in
`src/new-session/agent-default-config.json`. A desktop tab can override all three values during initialization. Suggested
questions populate the composer when clicked. The welcome markdown is presentation-only and is never included in the
prompt sent to the server. The 7777-only UI for this template feature lives in
`src/session/agent-welcome-compact.tsx`.

## Model Selector Defaults

See [Model Selector Defaults](docs/model-defaults.md) for selector behavior, source configuration fields,
and the localStorage-to-source update workflow.
