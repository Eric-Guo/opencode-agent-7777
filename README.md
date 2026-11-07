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

New conversations follow the main app's draft-before-submit behavior. `new-session/controller-compact.ts`
opens a local draft, and the compact-only `new-session/draft.ts` supplies location catalogs without a session ID.
`composer/submit.ts` creates and activates the server session on the first nonempty submission, then sends the captured
message, attachments and model selection. Startup without a saved session and deleted-session recovery also open drafts.
When a saved-session lookup fails, **Retry** looks up the same session again. Its ID, directory and unsent
draft stay in tab storage until the session loads or the server confirms that this particular session was deleted.
On confirmed deletion, the local draft opens with the saved prompt and attachments.
The embedded app keeps this orchestration in its existing compact controller and bootstrap modules instead of the main
app's routed `new-session/composer-adapter.ts`; recent sessions remain available while drafting.

`scripts/build-shared.ts` owns the compact agents' shared distribution build. It is maintained on `main`
and inherited by `plm-meeting`; either sibling checkout can run `bun run build:shared` to write its own
`dist-shared/`. It preserves branch-local imports and standalone outputs while sharing dependencies.
The desktop extension packages its HTML under `sigma-agents/` and merges `assets/` with the desktop renderer's assets. Tabs load `sigma-agents/plm-meeting.html` and `sigma-agents/7777.html`.

The review-source assessment uses parent `3064ac5302`, including the GUI extension split. Matching local filenames are
not shared imports: see the parity table for actual public exports and the remaining compact responsibilities.
7777 is an independent Git repository. Refactors use this checkout's behavior and public shared-package exports;
they do not rely on `packages/app` source.
File URL encoding uses `@opencode/util/path`; URL composition and directory search remain local.
Recent sessions, session actions, and directory-scoped refreshes use the same package's `sameDirectory` helper.
For example, a session saved under `C:\Work\Agent` appears when the active directory is `c:/work/agent/`.
Requests and stored settings keep their original path spelling.
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
Timeline Markdown displays workspace images in both the browser and desktop host. Relative paths resolve from
the active session directory. Absolute paths under that directory work too. The local `runtime/server/image.ts`
adapter uses the session client's file reader and keeps automatic reads scoped to that workspace. The shared
Markdown renderer owns image loading, retries and URL cleanup when the message or session changes.

Choose **Timeline → Wrap code blocks** in the gear menu to wrap long lines by default. Horizontal scrolling is
the initial setting. The browser remembers the preference. A single overflowing block can still switch between
wrapping and scrolling with its own toolbar button.

DOCX, PPTX, and XLSX previews follow the Office viewers at parent `dc2148dd6460a2ef4c10a58a6f25c4ee691b7558` in
`packages/gui-extensions/src/microsoft-office`. Local `microsoft-office` modules retain the reference filenames for
document, presentation, and spreadsheet viewers, workers, protocols, and rendering helpers. They preserve Word
pagination and selectable text, PowerPoint slides and speaker notes, Excel sheet tabs and cell selection, embedded
images, and bundled Word/PowerPoint CJK fonts. The compact renderer adapts language, links, and clipboard access
without an extension host; `workspaces/files/artifact.ts` follows the main app's byte-classification boundary and
checks format signatures and the 25 MiB Office file limit before loading an engine. `session/files/file-tabs.tsx`
keeps compact file loading, existing text/media previews, and toolbar details. Each Office engine loads only when its
format opens. Legacy binary `.doc`, `.ppt`, and `.xls` files remain unsupported.

Session labels share `@opencode/util/session-title-fallback`, with a local wrapper preserving the recent-session
agent fallback for absent titles.

The timeline shows quoted text, plugin notes, and older browser-element comments attached to user messages.
Server-file references appear beside inline attachments. Hover over a reference to see its path. Displaying the
card uses the saved filename and MIME type without fetching the file. The local `composer/comment-note.ts` reader
maps message metadata to the public `SessionUserPresentation` type from `@opencode/session-ui/timeline`.
It also handles existing file comments, including the plain-text format used in older sessions.

Click a non-image attachment in the transcript, or focus its card and press Enter or Space, to download it.
The filename uses the basename from the message. Image cards open their preview. The local
`session/composer/timeline-actions.ts` implements the public `SessionUserActions.openAttachment` callback.
It reads the delivered bytes or the just-sent prompt’s local attachment URL. Session export and attachment
downloads share the compact browser download helper in `runtime/platform/download.ts`.

Provider/model views in `runtime/server/types.ts` reuse public `@opencode/client/promise` fields, including capability
arrays. `runtime/server/global-sync/utils.ts` only adapts picker data: provider grouping, separate catalog/API IDs,
cost selection and variants. Unused legacy configuration fields and synthetic capability flags are removed. Capability
arrays are copied at the adapter boundary so Solid stores cannot mutate shared client catalogs; the tooltip retains its
existing modality order and omits unknown reasoning support. These files keep the main app's boundaries with local code.

Timeline scrolling follows the main app's `session/timeline/{interaction,machine}.ts` layout. The compact screen
uses the public `ScrollView` for its focusable viewport, keyboard navigation, nested scrolling and draggable
scrollbar. The local interaction adapter measures the viewport and handles upward keys and text selection.
The public `createAutoScroll` hook handles the wheel and owns the pause state, resize pinning and overflow anchoring.

The local machine distinguishes layout shifts after activation or **Jump to latest** from reader input. After an
upward key or text selection, a delayed scroll event near the end preserves the pause. Moving back to the end
or shrinking the scroll range can resume following. While paused, **Jump to latest** appears when the reader
is at least ten pixels from the end, including when the content grows without a scroll event.

Click the header's **current/9** counter to **Jump to message**. Search the displayed prompt, attachment names,
quotes, file comments and note cards. Each matching prompt appears once with an excerpt from the matching field.
Choose a result to scroll to it. Search uses the loaded transcript and makes no file or history requests.
Escape returns to the counter. **Jump to latest** resumes following.

`session/timeline/message-timeline-compact.tsx` keeps the compact header's binary **Thinking** preference and maps it
to the shared timeline's `full`/`hidden` reasoning modes. Enabling Thinking shows thought contents expanded by default;
individual thought sections can still be folded. The main app's `session/timeline/controller.tsx` derives its mode
from the broader timeline-detail settings.

Completed turns show their changed files by default. Turn them off under **Timeline → Changed files** in the
header gear menu. This browser remembers your choice. Expand a filename for its patch. If the read fails,
the row keeps its recorded paths and offers **Retry**. The header’s **Review turn changes** dialog is also available.

The same Timeline menu offers **Expand shell tool parts** and **Expand edit tool parts**. Both start off.
Each preference takes effect on the current timeline and is saved in this browser. The compact adapter passes
them to the public `SessionTimeline` through `shellToolDefaultOpen` and `editToolDefaultOpen`. Shared rows
handle tool grouping and manual disclosure. For a completed edit with file metadata, the first file’s patch opens
by default. An edit with only input text still offers its patch for manual expansion.

Expand a running shell to see its output as it arrives. Background commands keep updating while their
shell is running. Completed commands with saved output open directly from the transcript.
The public `@opencode/session-ui` shell row owns cursor reads, polling and the final output.
`runtime/server/global-sync/session-shells-compact.ts` connects it to the active directory. The first
live-output read loads the running-shell inventory. Reconnect refreshes that inventory, and switching
sessions or directories cancels pending reads.

The transcript uses the active directory’s model catalog for message labels and model-switch notices.
When two models are speeds of the same base model, the notice names the new speed. A missing catalog
entry displays the recorded model ID. `providers/catalog/providers.ts` reads the same cached lists used
by the picker, and the public `@opencode/session-ui` rows format the labels.

The optional rows use the public `SessionTimeline` and `TurnDiffSource` from `@opencode/session-ui`.
The local `session/timeline/turn-diff-machine.ts` decides when a changed-files row can load or retry.
`session/timeline/turn-diffs.ts` owns the requests and their cancellation. The compact cache lives
with the visible nine-dialog window. Prompts steered into the same turn share the diff identified by its closing
idle marker. The public client reads three context lines for the requested turn, with a 15-second deadline.
Rewinding past that marker, moving it outside the window, switching sessions or disabling the preference
releases its patch and cancels pending work. The settings provider uses `settings/context.ts` to keep its
context identity across development updates to `settings/model.tsx`.

The local `session/timeline/projection.ts` adapts assistant text for the public `SessionTimeline`. In the display
text it wraps bare HTTP(S) URLs inside full-width Chinese parentheses as Markdown autolinks, keeping trailing
prose and inline code outside the target. The context inspector and export read the original transcript.
Solid tracks each visible message and content part by object identity. A text delta updates the existing part,
so earlier messages and their charts keep their views. A replacement message gets a fresh view even if it has
the same ID. If a snapshot changes a part from text to reasoning in place, the timeline uses the raw reasoning text.

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

Context usage follows the GUI plugin's `context/{indicator,tab}.tsx` boundaries. The header renders the public
`ContextUsage` indicator from `@opencode/gui-plugins/context/context-usage` inside its native button. The local
adapter owns pointer and keyboard activation, focus restoration, and the cost, context, and token tooltip.
Local `context/model.ts` adapts the compact catalog for both views, delegating usage-step selection to
`lastAssistantWithUsage` from `@opencode/client/solid` so usage follows undo boundaries and completed compaction.
Missing usage or model capacity stays unknown in the details;
reported zero tokens remain zero. No app or plugin-host internals are imported.

Click the header's context ring, use **/context**, or choose **Add → Commands → /context** to open the read-only usage
dialog for the current session. `context/dialog-compact.tsx` owns the shared lazy dialog entry point for the ring and
command; this compact-only boundary replaces plugin-host mounting. The dialog is 900 px wide where space allows,
with 8 px side margins on narrow screens, and dismissal restores focus to the opening control.
It shows the latest assistant step's model, provider, context capacity and token breakdown alongside server-reported
session totals and cost. Totals are not reconstructed from the bounded message window, and no extra transcript read
or server command is needed. The dialog updates from the current runtime and closes when its activation changes.
Choosing the command from the Add menu preserves an existing draft and mentions; inline execution preserves
attachments. Like `/export`, it rejects arguments without sending or clearing the draft. The header's existing
ring and tooltip remain available.

The same dialog now inspects the latest loaded system message and individual raw messages in collapsible sections.
`context/tab.tsx` separates the existing usage statistics from transcript inspection, following the context plugin's
tab boundary. The public `Markdown`, `File`, and `Accordion` components own rendering and disclosure behavior;
JSON serialization and file viewers mount only for expanded records and update from the existing runtime.
Inspection makes no additional API requests and leaves the timeline's nine-dialog window unchanged. It shows only
loaded records, including any loaded instruction updates, rather than reconstructing a complete system prompt.
Choose **Export session** beside the loaded-history description, or use `/export`, for the complete saved transcript.
Closing or changing activation discards the inspector's view state.
New labels use the existing English fallback until translated; existing Chinese copy remains unchanged.
Summary and docked plugin panels remain outside this compact view.

The header's **Review turn changes** control reuses `@opencode/session-ui/session-review` in a lazy dialog.
It defaults to snapshot changes from the latest turn, with shared file accordions, counts, and split/unified diffs.
A shared selector adds working-tree, branch, and committed comparisons through the public `vcs.diff` API, scoped to
the active session's directory. Branch and committed comparisons share the base-reference form, applied on Compare
or Enter. Both start at the common ancestor with that base; branch review includes uncommitted changes, while committed
review ends at `HEAD` and excludes them. `review/parts.tsx` owns the title, description, and empty states, keeping mode
presentation out of the rendering/lifecycle panel. `review/{machine,model,panel,parts}` follows
the review plugin's boundaries in `packages/gui-plugins`; the compact-only `review/trigger-compact.tsx` supplies its
header action. `shell/commands/session-dialog-compact.tsx` shares the review and context dialogs' fixed-size lazy
loading, error boundary, dismissal and activation lifetime in place of the main app's plugin host.
The context ring supplies its explicit focus-return target through this local adapter. Escape and Close return
to that ring after pointer or keyboard activation, including after a command-opened dialog. Command opens keep
the shared provider's editor/caret restoration; a replaced dialog or session cannot reclaim focus.
The local `review/machine.ts` routes the existing event stream for the open dialog. Reconnects and the captured
session's execution outcomes and reverts refresh the selected comparison immediately. Only VCS modes refresh on
file events from the same directory. The driver in `review/model.ts` waits 100 ms after the last matching file event
and cancels that timer when another read starts or the dialog closes. Changing the comparison, closing the dialog,
or switching sessions aborts the active read.
Each read has a 30-second deadline. A timeout offers Retry for the same mode and base; a late reply cannot
replace a newer comparison. Drafts are preserved. Staged-only review (unsupported by the current public API),
comments, arbitrary history ranges, and docked extension panels remain outside this compact view.

`runtime/server/runtime.ts` and `runtime/server/data.ts` follow the main app's separate orchestration and data-adapter
boundaries. The runtime owns the activation's disposable Solid root, cancellation, publication, refresh scheduling
and nine-dialog hydration. The loader and timeline share the local `session/timeline/controller-projection.ts`
selector, following the main app's projection boundary. Hydration starts at 36 records and pages until nine visible
user or shell dialogs or no cursor can advance. The loader checks the current revert boundary after each page.
The cache excludes queued prompts and retains staged messages for Redo. A server revert that leaves the window
short can schedule another refresh through the same runtime. If a server commit overtakes a read, the cache
discards the stale page and the runtime starts again at the latest messages. The data adapter creates one
`createData` instance from `@opencode/client/solid` inside that root and guards session snapshots.
Shared data owns durable session records, messages, pending inbox snapshots and location catalogs.

`runtime/server/global-sync/session-cache-pending.ts` reconciles HTTP admissions, promotions and removals with
the shared inbox. An inbox event acknowledges its own ID, accounting for moves and withdrawals confirmed
after that admission. A successful hydration acknowledges receipts recorded
by the time its read began. If a delivery change arrives before the shared inbox has the item, its HTTP receipt
supplies the content and the adapter schedules the usual refresh.

`runtime/server/global-sync/session-cache-messages.ts` owns cursor termination, live-row reconciliation, optimistic
echoes, cancellation markers and skill/selection messages. Both caches stay local to the activation. A queue edit
supplies one set of retained and removed IDs to the transcript, and each published view uses the same pending list
for the queue and its messages. The adapter batches these changes with the shared event reducer.
`session/composer/timeline-actions.ts` supplies the public `SessionUserActions.pending` callbacks for the
active root session. The runtime reads pending status from the shared client. When an HTTP receipt arrives
first, it uses the confirmed delivery mode, the most recent idle marker, and delivered prompts in the current
turn. The timeline and the queue panel use the same local queue controller for moves and cancellations.
`runtime.test.ts` covers atomic publication, overlapping snapshots and mixed shell/user hydration.
`session-store-compact.ts` exposes reactive views and local UI state. Transport, directory request discovery and
embedded behavior stay local.

The main app has separate jump and fork pickers. In 7777, both search the same nine-dialog window, so
`session/commands/message-picker.tsx` shares the public `SearchList` and `Dialog` controls. The local
`session/commands/jump-to-message.ts` projects searchable card fields from the timeline presentation and
uses the public session UI attachment predicate. Fork uses the original prompt labels. The session cache
identifies delivered user prompts, excluding inbox items and optimistic echoes.
Each dialog closes with its session activation. A jump moves only the transcript's scroll viewport.

`session/{fork-machine,fork}.ts` gives the timeline and the composer’s `/fork` picker one operation per session
activation. The local `session/commands/fork-dialog.tsx` confirms draft replacement. The write has a 30-second
deadline. The normal session-switch path seeds the new draft before history hydration, so Retry preserves edits.

Transport scheduling follows the main app's `runtime/server/{request-queue-machine,request-queue}.ts` boundary.
One immutable machine owns active slots, FIFO waiting order, request IDs and stall-warning state; the driver owns
fetch, promise callbacks, cancellation and timers. The compact queue retains four total slots, two slow slots and
FIFO among eligible requests, without the main app's request priorities or transport disposal API. Server and directory
clients still share the same fetch/origin budget. Free slots dispatch synchronously; event streams bypass scheduling.
Slots release at response headers or fetch failure, including synchronous throws, while caller cancellation continues
to reach streaming bodies. Header deadlines remain 60 seconds, or ten minutes for worktree creation; stall diagnostics
retain their two-second threshold and ten-second cooldown. Pure transition tests cover immutable snapshots, stale
events and watcher cleanup; transport tests cover dispatch ordering, cancellation races and streaming behavior.
The implementation and tests stay local, with no app-source imports or new shared-package exports.

`session/session-ownership.ts` captures the active request client, runtime, session ID and local agent together with
the activation check used by submit/interrupt, undo/redo, queue actions, and permission/form reads and replies.
It follows the main app's ownership boundary using the compact runtime's identity instead of a routed key watcher.
Mutations and follow-up refreshes use that captured runtime directly, removing global cache and refresh forwarding.
Returning to the same session with the same client still invalidates earlier results; disposal or changing the selected
ID before activation also rejects stale writes. The helper adds no subscriptions or cancellation policy. Existing consumer
tests retain coverage for draft restoration, request routing, pending flags, errors and successful prompt history.

`session/requests/sync-compact.ts` centralizes permission/question response handling and directory request grouping.
The dock and permission notifications use the active session and its descendants. If a directory read or an event
reports a pending request from an unknown session, `session/requests/request-ancestry.ts` follows its parent IDs
through the public session client. Each activation shares lookups for missing parents. A walk has 30 seconds to
resolve, and **Retry** repeats the outstanding lookups after a failed read. Requests whose owners are already known
stay available throughout. A child can use its own directory for web-search providers.
The permission and form adapters retain their public client endpoints, event filtering and child-session routing.
Replies keep the request visible until accepted, block duplicate submissions, preserve failures for retry,
and ignore results from an earlier activation even after returning to the same session. An older response
cannot clear a newer pending reply. Web-search forms have their own two-step reply protocol.
This compact-only module replaces duplicated lifecycle code without depending on the main app or moving request
policy into the shared `session-ui` rendering library.

The question and permission docks adapt package-local `question-prompt.tsx` and `permission-prompt.tsx` widgets
under `src/session/requests/`. These widgets own answer selection, custom text, progress navigation, keyboard focus,
pending controls and permission decisions. Only the existing `@opencode/session-ui/dock-prompt` shell and styles
are shared. The main app keeps its own prompt implementations, including its question draft cache, collapse controls,
global shortcuts and viewport sizing. Compact widgets are not exported by `session-ui` or consumed by the main app.
`question-machine.ts` owns answer edits, progress navigation, and reply construction. Each mounted request has
its own state through `question-state.ts`. A custom answer has its own place in selection order. Editing, clearing,
or disabling it preserves explicitly checked options, even when their values match the typed text. The reply
includes matching values once. The editor retains the original text, including whitespace and newlines.
`question-keys.ts` maps compact shortcuts to actions. `question-prompt.tsx` owns DOM focus and textarea sizing.
The `session-question-dock.tsx` and `session-permission-dock.tsx` boundaries retain form-field filtering, label
fallbacks, compact translations and the existing callbacks. Each request mounts a fresh question widget.
Scalar/multiselect payloads, unanswered-field omission, custom-answer trimming and deduplication, Escape and
modifier-Enter behavior are preserved. Package-local browser fixtures render the production widgets; run
`bun run test:components` from this checkout to exercise them without a backend.

The local `session/requests/session-elicitation-dock.tsx` displays MCP input requests from the active session
and its descendants. Directory-wide requests appear after those requests and show the active directory.
`elicitation-machine.ts` applies field edits and derives visibility, completeness and typed answers in field order.
`elicitation-controller.ts` keys drafts by the pending request object so edits survive dock remounts and
failed submissions. URL requests open through an explicit link and settle on Submit,
Dismiss or a server event. The dock uses the public `DockPrompt` shell and UI controls. Its replies use the
compact form lifecycle, including the owning directory on writes to a directory-wide form.

Web-search consent follows the main app’s `session/requests/{websearch,websearch-machine}.ts` boundary.
The compact dock sends **Any** and **Don’t use search** in one reply. For a named provider it waits for the
server to accept `choose` before answering the same session’s provider form. Both the event stream and the
request store can supply that form. If it is still missing after acceptance, 7777 reads pending forms once
through the public `session.form.list` API for the originating session, including child sessions.
If the chosen provider disappears, the dock asks the user to confirm a replacement. The handoff releases the composer after 10 seconds if the
form never arrives. Provider-list reads and replies have 15-second deadlines. The compact dock keeps its
existing shell, translations and composer placement.

Permission notifications follow the main app's `shell/notifications/{machine.ts,notification.tsx}` boundary. The
local machine scopes deduplication to the runtime activation and keys attempts by session and request ID. The
driver translates the alert, tries the desktop host first and falls back to browser permission. Before delivering
a delayed alert, it checks that the attempt is current and the request is still pending in the active tree. A refresh
retires earlier attempts and may notify again for the first pending request. Replies and runtime disposal prevent
stale delivery. Integration coverage stays in `session/requests/permission-sync-compact.test.ts`.

See [Code Layout Parity Review](docs/code_parity.md) for the module-boundary comparison with
`<repo-root>/packages/app` and the intentional compact-app differences.

Persistence follows the main app's `runtime/persistence/storage.ts` and `runtime/server/persistence.ts`
boundaries with package-local implementations. The compact storage adapter is synchronous; drafts, history,
settings, language, and model/session preferences share it while retaining their existing keys and formats.
Model preferences and accepted-prompt history use its local `persisted` store helper, following
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

`runtime/i18n/language.tsx` owns `UiI18nBridge`, matching the main app's language boundary while `app.tsx` composes
the provider tree. Ordinary, plural and synchronous translations reuse the public `resolveTemplate` formatter and
parameter type from `@opencode/ui/context/i18n`. Locale detection, the `opencode.7777.language` plain/legacy formats,
English fallback and eager English/Chinese dictionaries remain local. The compact adapter keeps `zh-CN` formatting,
its document language and cookie updates, and synchronous language switching without importing app source.
The compact `runtime/i18n/language-context.ts` keeps the provider identity stable across translation hot updates.

`providers/models/configured.ts` resolves the global fallback when the catalog loads. It tries the saved selection,
then the source-configured default, then server defaults in catalog order, then the first catalog entry.
Exact catalog IDs take precedence over unambiguous legacy API IDs.

The local `providers/models/selection-machine.ts` selects the model and its variant together. An available unsent
choice for the active scope takes priority over the session's model for the current agent, followed by the global
fallback. An explicit **Default** belongs to its model. If the catalog drops that model, the next available choice
supplies its own variant. Visibility filters picker results and recent-model cycling while allowing a hidden model
to remain active. The editor and submission both use `composer/selection.ts` for variant resolution and cycling.
Scoped choices and pending acknowledgements outlive individual composers.

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

The model selector's open state in `providers/models/select-dialog.tsx` also controls its ChatGPT-plan footer.
Opening the picker with an OpenAI model selected reads the public client's integration catalog for the current
directory. The first connection must be an OAuth credential to show **Using ChatGPT plan** and **Manage usage**.
`providers/catalog/integrations.ts` uses a Solid resource to track the latest read and the existing event stream to
refresh on connection changes or reconnect. While a read is pending or failed, model selection stays usable.
Reopening retries. The footer also works when `manageModels` is disabled.

Model picker headings now reuse `ProviderModelIcon` and the Console catalog helpers for short provider names and
workspace badges when the same provider is also connected directly. Label resolution uses the full catalog, so
search and visibility filtering cannot hide the workspace identity. This presentation logic stays in
`providers/catalog/console.ts`; free-model classification follows `providers/models/models.tsx`. Model management
uses the shared `TextInput` clear action, including its focus behavior, without a separate button or positioning CSS.
`providers/models/tooltip.tsx` keeps the compact layout used by the picker; the unused legacy layout and its provider
name heuristics are removed. Model tags, input ordering, optional reasoning information and locale-aware limits remain.

The compact model picker in `providers/models/select-dialog.tsx` uses the same public `@opencode/ui/search-list`
as the main app's desktop model dialog. A non-modal `@opencode/ui/popover` anchors it to the composer. The list
owns provider sections, combobox IDs, active rows, arrow wrapping and keyboard scrolling. The picker supplies
model visibility and provider order, with a 220 px cap on the results. Opening highlights the current model when
visible. Editing or clearing search highlights the first match by model name. Arrow keys then follow the displayed
provider order, including Ctrl/Shift with Up or Down. A checkmark identifies the selected model while browsing.
When `manageModels` is enabled, **Manage models** sits below the results and is reachable by Tab or click, even
when no models match. Enter in an empty result list keeps the picker open. Selection and Escape return focus to
the composer. Clicking outside leaves focus on the clicked control.

In a root session, **Use a free model** and **Switch model** on a budget notice open this same picker when
model selection is available. The local `session/composer/timeline-actions.ts` adapter supplies the action
to `@opencode/session-ui`, which renders and translates the notice. You choose the replacement model.

Recent-session search in `home/sessions/view.tsx` uses the public `TextInput`, `MenuScroll` and `createTypeahead`
directly. It retains plain-arrow navigation, IME and repeated-Enter guards, and server paging. Both pickers have
rendered coverage in `component-tests/pickers.spec.ts`.

Recent-session search follows the main app's `home/sessions/search-machine.ts` boundary. The compact version
plans reads for one directory at a time. A full session ID triggers an exact lookup alongside the first title page.
The picker keeps a separate exact match even when the server returns 12 title matches, so Load more can resume at
the server cursor. After filtering duplicates, the current session and rows from other directories, the next
read asks only for the number still needed.
`home/sessions/index.ts` runs those reads under one 30-second deadline. The query driver owns the 200 ms debounce
and cancels reads when the picker closes or its source or query changes. The load machine retains the last
published cursor and rows for Retry.

The compact-only `home/sessions/directory-sync-recent-compact.ts` uses the same page loader for the background
directory snapshot. These rows supply known parents for request routing and neighbors for session deletion.
Each refresh uses the active session or draft's client and supersedes the previous
read. A failure keeps the last successful list and gives the error banner a retry for that directory read. Switching
sessions or drafts retires the outstanding read and its retry action.

Recent-session ordering, calendar-day grouping and display labels now live in `home/sessions/records.ts`, following
the main app's record boundary. Controllers and views no longer import the directory-sync adapter for presentation
helpers. The header region supplies the active agent's fallback title; record helpers remain independent of runtime
state. Activity ordering (including ID ties), local dates, invalid-date fallback, twelve-row pagination and full-history
search are preserved. The existing grouping and ordering tests now live in `home/sessions/records.test.ts`;
`controller.test.ts` retains coverage for selecting the latest record and rejecting stale selections.

Composer suggestion popups reuse `TextInput` and `MenuScroll` in `composer/editor/editor.tsx`.
The shared field owns command-search styling and clearing; the shared viewport owns the popup scrollbar.
Local code retains filtering, compact shortcuts, focus restoration, draft preservation and boundary-based sizing,
including the 28 px search row and partial next-row hint. Inline slash commands and context suggestions use the
same viewport without adding a separate search field.

`composer/editor/interaction.ts` also delegates active-row reconciliation, wrapping and selection to public
`@opencode/ui/typeahead`. It receives only selectable rows, excluding file results while their replacement search
is pending. Query edits reset the highlight; catalog refreshes preserve a matching row and removed rows fall back
to the first result. The adapter keeps Tab completion, Ctrl+N/P, modified arrows, IME Enter handling and keyboard
reveal. Escape and Ctrl+G still dismiss suggestions before stopping a run, and an empty popup consumes Enter/Tab.
The local `composer/suggestions/machine.ts` retains popup modes, queries and draft effects without a second active-row
state. This intentionally uses the existing shared controller within the main app's editor/suggestions boundaries;
no app source or new shared exports are needed. `component-tests/composer.spec.ts` owns the former machine arrow-loop
contract through rendered controls, plus hover/refresh behavior, context completion and command-menu draft/focus
preservation.

`composer/editor/mention-search-machine.ts` follows the main app's mention-search boundary with a local file-only
machine; `interaction.ts` runs its timers and requests. File searches debounce for 150 ms and settle within ten
seconds, including response decoding. Closing the menu, changing its query, replacing the draft/session/search
source, or disposing the composer retires the attempt and aborts its request. Source ownership includes server,
directory and runtime/draft data identity, so reactivating the same session also rejects earlier results. Reopening
the same query starts a fresh search. Immutable machine snapshots stay outside Solid stores.
The public `useFilteredList` now receives synchronous context rows: skills, agents and recent entries filter
immediately while file search runs. Previous query/source file results remain hidden. Compact grouping, mention
offsets, shortcuts and focus behavior stay local. Failure or timeout keeps local suggestions usable and uses the
existing failure copy when there are no rows; editing or reopening retries without an automatic retry loop.
`workspaces/files/model.tsx` forwards the caller's abort signal and settles cancelled reads even if the transport
ignores cancellation, while retaining its status API, 50-result limit and path deduplication. Machine/driver tests
cover attempt ownership and cleanup; the composer browser suite covers local filtering during a delayed search,
Escape cancellation, same-query reopening, timeout recovery and stale-file exclusion. No session mentions, shared
exports or app-source imports are introduced.

Composer DOM synchronization follows the main app's `composer/editor/{dom,machine}.ts` boundaries with local
implementations. The editor compares inline text and mention targets before rendering instead of skipping the next
store update after input. Attachment-only changes preserve the DOM, caret and native undo/redo, while in-place store
edits still update the editor. A two-state machine retains browser-created blank lines for the local input echo and
allows a subsequent explicit clear. The compact parser keeps its existing Unicode offsets, block/newline rules and
file metadata; matching mention nodes receive the latest URL, selection and source without replacing the node.
`component-tests/composer.spec.ts` owns caret, undo/redo, reactive updates and blank-line behavior; `dom.test.ts` covers
text-run matching and mention identity/metadata. No shared-package changes or app-source imports are required.

Suggestions and recent-session results use `@opencode/ui/menu-scroll` directly. The model picker gets the same
scroll viewport through `SearchList`. All three have an overlay thumb on pointer devices and native scrollbars on
touch devices and in high-contrast modes. Recent-session keyboard reveal uses the viewport ref. The 220 px
model-list limit, recent-session height cap, and composer suggestion boundary sizing remain local.
The composer editor keeps its native scroll container,
reserving the shared scrollbar width and compensating its end padding so long drafts keep the same text wrapping.
The editor owns caret reveal, popup sizing and focus restoration. The attachment strip and toolbar also declare
nested scroll ownership. Only the timeline keeps
`ScrollView` for its keyboard navigation and custom thumb. No main-app source or new shared exports are required.

File-tab persistence follows the main app's `shell/state/layout.tsx` boundary with a package-local implementation.
It restores tab order and selection per server, workspace directory, and the desktop tab's configured session
storage namespace. Sessions in the same workspace share tabs. Temporary-preview status stays in memory; after a
reload, restored tabs are retained. The compact layout uses the local storage adapter without a router or imports
from `packages/app`.

PLM project selection follows the main app's `my-todo/{project-selector,select-project-dialog}` boundaries.
The selector receives its server and project through props. The local `project-selector-compact.tsx` adapter connects
the single active session to `runtime/server/sync-project-compact.ts`, which owns project reads, saved updates,
and `project.updated` events. Changing server or project disposes the previous scope; sessions in the same project
reuse it. Failed reads expose Retry, and late reads or saves cannot overwrite a newer project update or close a
replacement dialog. These modules use `@opencode/client` and package-local code; they do not import `packages/app`.

The meeting-only recorder stays in `src/session/header/recorder-control.tsx`. Stop saves
`record_<timestamp>.mp3` in the active session's working directory before calling transcription.
Failed saves retain the audio for another Stop attempt and block Start until it is saved. After
a successful save, Stop is disabled even if transcription fails; drag the saved MP3 from the
file tree into the composer to transcribe it manually. The saved path appears in the recorder status.
The server's `audio.recording.release` endpoint frees the retained MP3 only after the write succeeds;
this requires a server build containing that endpoint. Cleanup failure leaves the saved file intact
and does not prevent transcription.

Queued-prompt undo follows the main app's `session/composer/{queue,queue-machine,queue-panel,controller}` boundaries.
The queue machine also projects the preview and attachment count for each inbox item. The controller reconciles
those rows by inbox ID, keeping the focused action mounted when a refresh changes its preview or adds another row.
The local implementation restores text, inline attachments, and file, agent, and skill mentions into the single
persisted draft. Historical and queued prompt reconstruction share the package-local `composer/prompt.ts`
boundary; the queue controller retains cancellation, draft merging, and activation guards. This shared local
restoration helper intentionally replaces the main app's separate queue conversion. Hidden context without a
mention and malformed queued mention ranges stay queued because the compact draft cannot preserve them.
The local queue machine owns the operation and attempt; its driver listens to the originating runtime's events.
Undo restores once after HTTP success or an explicit cancellation event. A delivered event settles without restoring,
and a missing inbox row alone cannot confirm cancellation. Queue writes retain the transport's 60-second header
limit. Failures schedule the existing runtime refresh without replaying mutations. Session changes or disposal
settle the old caller and detach its listener; late responses cannot modify another activation or its draft.

History actions follow `session/{revert,revert-machine}.ts`. One signal holds the local machine's immutable snapshot,
including whether the mutation is awaiting confirmation or has committed and is refreshing history. Its 30-second
bound settles callers even if a transport ignores cancellation. Timeout or failure before confirmation reconciles
through existing session and history reads; neither automatically repeats the write. A confirmed boundary and
restored draft survive refresh failure or timeout. Shared history loading keeps its own ownership and guards.
Switching sessions, including reactivating the same ID, releases action-owned controls and rejects stale effects.
The compact loaded-history navigation and draft-change checks remain local; no routed prompt cache is introduced.

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
runtime's shared location resources and retains independent loading/failure states. Owned Solid resources now
track those reads instead of a parallel status store and generation counter. Changing or clearing the source disposes
the previous observations, while the public client's shared reads and cache remain available to other consumers.
The adapter owns its cleanup; render-time status reads cannot suspend the composer or throw a catalog failure into
its boundary. Retry, partial failures and live catalog updates retain their existing behavior. The local adapter stays
separate from `composer/model.ts` because 7777 has no main-app workspace provider to own initial catalog loading.
`catalog-compact.test.ts` exercises the real Solid browser lifecycle; the composer browser fixture covers typing and
suggestions while a catalog is pending, failed and retried. Providers and models use the
same resources, with the explicit server-default-model read first and compact selection/visibility rules afterward. File search follows the
main app's `workspaces/files/model.tsx` and `workspaces/files/path.ts` boundaries with a package-local search controller
and URI helpers. The compact-only `workspaces/files/search-machine.ts` owns request attempts and ready/loading/failed
transitions, following the main app's separate file-lifecycle machine pattern. The model runs requests and uses the
public `@opencode/util/abort` helper; its reactive status is derived from the machine, without a separate version counter.
Clearing or replacing a search rejects late successes and failures, including repeated queries in the same directory.
Existing limits, path deduplication, empty-query handling and composer cleanup remain unchanged, with coverage in
`workspaces/files/model.test.ts`. It searches files and directories without file tabs or a workspace provider.
File, skill, and agent mentions persist in drafts and accepted-prompt history and retain their offsets in prompt and command requests.
Agent suggestions exclude hidden and primary-only agents. Local session actions enter through the composer adapter;
the broader app command provider remains unavailable.

`composer/suggestions/catalog-compact.ts` owns the compact catalog-to-suggestion conversion. It gives local and
server slash commands one row builder, retains local-trigger precedence, and constructs skill, agent and file
mentions without importing the runtime store. The main app keeps these projections in `composer/model.ts`;
7777 deliberately separates them so its model only wires location resources, editor actions and submission.
Catalog order, labels, agent filtering and original-directory file URLs remain unchanged. The local projection
tests cover command collisions and mention payloads through draft restoration and request construction.
Attachment IDs now use the public `@opencode/util/uuid` helper, including its insecure-origin fallback.
The duplicate local helper and unit tests are removed; `packages/util/src/uuid.test.ts` owns UUID behavior,
and `composer/attachments/attachments.test.ts` retains coverage of attachment insertion without `randomUUID`.

Session JSON export follows `session/commands/{export,export-machine,export-session,use-session-commands}` and
`composer/client-slash-command.ts`. The public client's `session.export` transfer API supplies the complete saved
transcript, independently of the compact timeline's nine-dialog window. The browser download uses the native
`{ info, messages }` transfer shape with pretty JSON and a safe title-based filename (falling back to the session ID).
The shared UI toast reports preparation, download initiation or failure; concurrent export requests are ignored
until the current one finishes. Local `/export` takes precedence over a same-named server command and never submits
a prompt or changes model/session settings. Inline execution preserves attachments; choosing it from the Add menu
preserves the existing draft and mentions. It needs no app imports, host command provider or native save dialog.
The compact `session/header/session-options.tsx` menu serves the current session and recent-session rows.
Rename follows `session/commands/rename-session.ts`, which saves the title and reconciles the active session and
recent list. Delete follows `session/delete-machine.ts`, which tracks the selected session and admits one write
per confirmation. Both menus use the compact `session/commands/session-actions.tsx` dialog driver for form state,
focus and inline errors. Its `session-write-compact.ts` helper accepts HTTP success or a matching server event
within 15 seconds. A confirmed write keeps its original target if the dialog closes during navigation.
The header, recent-session rows, context dialog and slash command share one screen-owned exporter.
It captures the selected session and continues across navigation. Its machine bounds fetch and response
decoding to 60 seconds, then reports failure and allows another export. Timeout or owner disposal dismisses the
loading toast, aborts the read and rejects late download effects; disposal is silent. The command hook only delegates
to this driver. Notifications use the active language provider, including hosts without preference storage;
missing locale keys retain the existing English fallback. Disposal during synchronous state or notification updates
settles the caller, prevents unsent requests and suppresses completion notifications.

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
Upload progress and authoring path attachments or plugin notes belong to the main app's composer.
All implementations stay package-local or use public shared-package exports.
Markdown parsing and sanitization dependencies belong to the shared UI packages; 7777 no longer declares unused
direct dependencies on `marked` or `dompurify`.
The PLM meeting prompt omits the direct file picker and its Mod+U shortcut. Its **+** menu offers Commands and Context;
workspace references, pasted or dropped attachments, and restored drafts keep their existing behavior.

`runtime/platform/file-picker.ts` owns the compact attachment format policy used by composer validation and desktop
extension filters. Shared format entries supply MIME lists, native filters and image/PDF
filename fallbacks; bounded text-content detection also lives here. Declared MIME precedence, the JPEG filename alias
and existing picker filters are preserved. Exported lists are frozen and picker calls receive copies, avoiding mutable
options shared with the host. This policy stays local because the main app's attachment destination/upload behavior
differs; attachment handling remains in `composer/attachments/attachments.ts`.
That module owns error reporting for attachment operations, retaining files already added when a later read fails.
The PLM composer uses its paste and drop entry points.
`runtime/persistence/drafts.ts` snapshots attachment content once, so a file from disk or the clipboard only
needs to remain readable until its data URL is ready. On secure origins it hashes the bytes of that URL with
SHA-256 using the public `@opencode/util/base64` decoder. Browsers without SubtleCrypto retain random 16-byte
IDs. The browser supplies the MIME header, and the existing draft format stores the URL and lowercase hex ID.
Cancellation during the read or digest discards the pending attachment. Admission checks, duplicate detection
and the embedded drop scope stay in the composer.

Animated presence follows the main app's `runtime/{presence-machine,presence,animated-presence}.ts` boundaries
with local implementations. The pure machine owns visibility, retained values and minimum-duration attempts;
the driver owns DOM listeners, reduced-motion observation and bounded exit timers. Completed or cancelled CSS
animations/transitions release their element; missing events fall back to the computed duration plus 50 ms
(250 ms base when an animation has no duration). Reappearance, replacement elements, identity changes and disposal
retire previous exit work. Immutable snapshots stay outside Solid stores. Existing drop feedback and alternate
delivery styles remain owned by their components; no app-source imports or shared exports are introduced.

The compact-only `shell/commands/menu-dismiss{,-machine}.ts` adapter owns deferred close work for the model
picker. Like the main app's model drawer it bounds close-before-action work, here at 600 ms,
while retaining the compact two-frame focus-settlement delay after detachment. Each gesture captures its original
element and opening attempt. Reopening, draft/session replacement and disposal cancel old callbacks and scheduled
work; a late model-manager import also checks that captured ownership. PLM meeting keeps its picker-free Add menu
and uses this adapter only for the model picker. Outside-click focus, keyboard
navigation and search behavior remain owned by the existing public Menu/Popover/SearchList controls.

Attachment preparation now follows local `composer/attachments/{preparation-machine,preparation}.ts` boundaries.
The main app's upload lifecycle is the structural reference; 7777 deliberately keeps inline files and has no server
upload destination or global upload service. One machine owns each gesture's attempt, picker/preparation phase and
completion. The driver owns timers, cancellation and caller settlement. `PromptState.scope` is an ephemeral token
replaced on reset or restoration, so navigation (including returning to the same session), draft replacement and
disposal retire pending work without writing files or errors into another draft. Ordinary typing keeps its scope,
and completed files append to the latest draft and retain its current caret.

The composer shows the public `Loader` and **Cancel pending files** during preparation. Sending, including Enter
and alternate delivery, waits for every active preparation; blocked send attempts are not replayed automatically.
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

The compact runtime now uses explicit lifecycle machines for startup, runtime attachment, active reads, session
switching, catalog loading, and the New session action. Finite read admission shares the local
`runtime/server/load-machine.ts`; this deliberately stays compact-specific rather than adopting the main app's
multi-server registry and workspace cache. The local `runtime/server/server-sync/{connection,machine}.ts` modules
own the event stream. `refresh-machine.ts` owns hydration, debounce scheduling and one coalesced follow-up pass. Promise resolvers,
controllers and timers stay in their drivers. Machine snapshots use immutable values outside Solid stores;
UI busy/loading fields are projections. Switching away and returning creates a distinct owner.

An active session reconnects its event stream after EOF, a transport error or 45 seconds without bytes.
Keepalive comments renew the deadline. Repeated failures back off from one second to 30 seconds. Switching
sessions or disposing the page cancels the pending retry and the previous subscription. The first server greeting
on each connection refreshes messages, forms and permissions. A permission asked while the stream was down
appears in the dock, and a request answered elsewhere disappears. Reconnecting preserves notification history
for requests already announced in this activation.

`session/commands/use-session-commands.tsx` owns the compact command context. The implementation lives in
`session/commands/session-commands.ts` and `AppInterface` supplies its value. The context has only a type
dependency on those commands, so a Vite update to the session services preserves the mounted context identity.

`runtime/server/operation.ts` bounds complete API promises, including response decoding. `read-client.ts`
applies that bound beneath shared `createData` synchronization, so a stalled read releases its pending cache
entry and can be retried. Data-owner cancellation covers shared resources; retiring one observer does not abort
another consumer's catalog read. `read-errors.ts` supplies the compact error banner's localized Retry action.
Startup, activation, catalogs and each hydration pass have 60-second deadlines. Retry keeps the current target,
loaded transcript and unsent draft. The initial 36-record hydration and latest-nine dialog window remain bounded.

`composer/{machine,submit}.ts` follows the main app's submission machine/driver boundary locally. Each send
claims its owner before asynchronous work and captures prompt content, attachments, selection and delivery.
Creation, configuration and admission each have a 60-second deadline. A matching inbox admission event can
confirm a send before HTTP completes; history records once, and late HTTP results cannot restore a newer draft.
Existing-session sends retain their captured target across navigation; a departed draft cannot promote a late
creation. Interrupt remains `resume: true` with a 60-second bound. Uncertain writes reconcile through reads,
without automatic resubmission.

If a send fails and restores your prompt, pressing **Send** again with the same content, model and delivery
reuses the original message ID. This also works after reloading the restored draft. The local
`composer/retry.ts` binds that ID to the backend, session and outgoing request, including attachment bytes
and mention ranges. An optional record in the tab draft keeps the fingerprint and original model selection.
When the timeline or inbox already confirms acceptance, Send clears the restored draft and records history
locally. Otherwise opencode2 reconciles the repeated ID, and the inbox refresh establishes queue status.

`providers/models/selection-machine.ts` follows the main app's selection boundary while keeping 7777's scoped
keys and persisted shape. Persistence is an output effect. Model acknowledgement expires after ten seconds,
retaining the local choice. Old acknowledgements and cancellations cannot retire newer choices or commits.
Optional agent-catalog timeouts leave the model catalog available and permit a later refresh.

`session/requests/{reply-machine,list-machine}.ts` deliberately shares compact permission/question lifecycle
rules rather than importing the main app's dock controllers. Permission replies have 15-second deadlines;
question replies and dismissal have 30 seconds. Directory reads cannot clear reply ownership, overwrite newer
SSE-created forms, or resurrect settled IDs. These ledgers belong to one runtime activation. Existing widgets,
answer editing, child-session routing, notifications and the separate web-search protocol stay local.

File browsing follows the main app's `session/files/{file-tree-v2,file-tree-v2-model,open-in-app,
open-in-app-button,open-in-app-path,file-tabs,file-tab-scroll,tab,session-side-panel}` and `workspaces/files/{file-model,tree-store,path,watcher}`
boundaries, using package-local implementations and the shared UI tree styles. The compact file model uses
`file-model.ts` because it receives the active workspace directly instead of rendering a context provider. The compact app intentionally
places the tree left of both the conversation and composer. File tab transitions follow
`shell/state/session-tabs.ts`, with local preview, open, close, and move operations. The local `tab.tsx` uses the
main app's `SortableTab` boundary and the same declared `@dnd-kit` dependencies. The tab strip, selection,
drag orchestration, and strip styles now belong to `session-side-panel.tsx` and its stylesheet, matching the
main app's boundary. `file-tabs.tsx` owns the selected file's loading and preview, using `@opencode/session-ui/file`
for text rendering. MP3 previews use native audio controls for playback, seeking, and volume. Recordings
use the existing file-read API and a local blob URL, without the image/PDF size limit; switching files
stops playback and releases the URL. The left tree and conversation tab retain their compact layout.
`file-tab-scroll.ts` keeps the selected tab visible on selection and resize, and maps vertical wheel input to
horizontal scrolling when the strip can scroll. It leaves page scrolling and browser zoom available at the edges.
Open tabs, their order, and the selected file or **Conversation** survive reloads. Switching server or workspace
restores that scope's tabs; sessions in the same workspace share them. The desktop tab's configured session storage
key isolates its file layout from other agent tabs. Temporary-preview status is preserved while switching scopes
in memory, but restored tabs become retained after a reload, matching the main app. Only file paths and selection
are stored, and only the selected file is fetched. Malformed saved entries are ignored; storage failures leave
tabs usable in memory. Closing the last tab clears that scope's saved layout.
`SHOW_FILE_TREE_PANEL` in `src/constants/session.ts` controls the entire feature and defaults
to `true`; set it to `false` to restore the full-width conversation. The tree follows the active workspace directory,
including the draft's default `<server-root>/agent-plm-meeting` folder before the first message and restored sessions'
`location.directory`. Browsing, searching, and previewing files in a draft does not create a persisted session.

Drag a file tab left or right to reorder it, or focus it and press **Alt+Shift+Left** or **Alt+Shift+Right**.
Keyboard moves retain focus for repeated moves. The conversation tab stays first; moving files preserves the
selected file and temporary preview. **Escape** cancels a drag. Drops are ignored if the workspace or open tabs
changed during the drag. Closing, keeping open, and replacing a preview work in the new order.

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
If a page takes longer than 30 seconds, choose **Retry** to load it again. Your search, previously loaded rows,
and highlighted session stay in place. Clearing the search or reopening the popover starts again with the first batch.

Use the **…** menu in the header for the current root session. Each recent-session row also has a **…** menu
and supports right-click. Choose **Rename session** to edit its title, **Export session** to download its JSON,
or **Delete session** to open a confirmation naming the session. Cancel returns focus to the opener.
Editing another session keeps the current conversation and composer draft. Deleting the active session opens
a neighboring root session from the loaded directory history, or a fresh draft when none is available.

## Fork from here

In a root session, open a delivered user message’s **More actions** menu and choose **Fork from here**.
You can also type `/fork` or select it in the composer’s **Commands** menu to search the latest nine dialogs.
The picker lists delivered user messages newest first and shows filenames for attachment-only messages.
Escape returns to the composer. Opening the picker from **Commands** keeps your unsent draft.
If the directory defines a server command named `fork`, the composer runs that command with its arguments.
The new session contains the history before that message, including earlier turns outside the nine-dialog window.
Its composer opens with the selected message’s display text, supported mentions and attachments ready to edit.
An unsent draft triggers a replacement confirmation before creation. If the draft changes during creation,
Cancel keeps those edits in the source session. The created fork is available in **Recent sessions**.

## Undo and Redo

Use **Undo** in the header to rewind the latest user turn and restore its prompt and attachments to the composer.
File, agent, and skill mentions remain structured references through editing, reload, and resubmission. Historical
file mentions retain their server URI, including any line range. If visible prompt text shifts a mention's offsets,
restoration searches for that mention in order; context absent from the visible text stays out of the draft.
Use **Redo** to restore one undone turn; redoing the final turn clears the revert boundary and composer. The existing
**Revert message** action uses the same controller, so a message-level revert can also be stepped forward with Redo.

These actions operate on the loaded history and are available when the session is idle, messages have finished
loading, and no follow-ups or requests are pending. Send or remove pending follow-ups before rewinding. Undo and
reopening a reverted session load older messages as needed to fill the latest nine visible dialogs. Failed requests
preserve the current draft and boundary; responses from a previous session activation cannot overwrite the current
session or its draft.

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

A steered follow-up waiting behind a running turn shows **Pending** in the transcript. Open its **More actions**
menu to **Move to queue** or **Delete** it. Delete withdraws the follow-up and keeps your current draft.
From the queue, **Steer** (or **Send** when idle) returns the same prompt to the transcript. Once the server
delivers it, the message offers its usual history actions.

Each queued prompt's attachment count includes its payload files, saved file references, quotes, and notes.
A file comment counts through its attached file. Older prompts keep their saved preview text.

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
