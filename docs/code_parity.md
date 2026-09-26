# Code Layout Parity Review

7777 is an independent Git repository. Runtime code, build configuration and assets must not import from
`packages/app` or `packages/desktop`. Public OpenCode package exports are reusable, including `@opencode/session-ui`,
`@opencode/gui-extensions`, `@opencode/client`, `@opencode/ui` and `@opencode/util`.
Matching the main app's filenames describes local ownership, not a source dependency.

This is a scoped refactor guide, not a full upstream audit. Keep existing behavior: ask before adding, removing or
changing a feature. Intentional compact behavior is not a parity gap. Earlier comparisons, benchmark measurements
and detailed change history remain in Git history; the current baseline is 7777 `2d0bb08` (2026-10-06).

## Shared code and local boundaries

Paths are relative to `src/`. See the [README](../README.md#code-layout-parity-review) for behavior details.

| Area | Public reuse | Local ownership |
| --- | --- | --- |
| Timeline | `@opencode/session-ui` timeline, document, actions, markdown and cards | `session/timeline/`: nine-dialog projection, binary Thinking setting, revert and historical comments |
| Scrolling | `@opencode/ui/scroll-view` and `createAutoScroll` | `session/screen.tsx` and `session/timeline/interaction.ts`: viewport, pause/resume, arrival and resize handling |
| Runtime | `createData` from `@opencode/client/solid`; promise client | `runtime/server/`: activation, bounded hydration, optimistic overlays, snapshot races, directory requests and one SSE stream |
| Models/providers | Shared location resources, public client types and UI controls | `providers/{catalog,models}/`: defaults, visibility, Console groups, variants, OAuth footer and manager gate; `runtime/server/{types,global-sync/utils}.ts`: catalog view adapter |
| Composer | Shared resources, attachment cards and controls | `composer/`: editor, serialization, drafts, history, prompt restoration and independent catalog failures |
| File mentions | `encodeFilePath` from `@opencode/util/path` | `workspaces/files/{model,path}`: directory search, cancellation and absolute server URIs |
| Requests | Shared `DockPrompt` and `DockSurface` | `session/requests/`: directory-wide discovery, child sessions, replies, notifications and web-search handoffs |
| Queue/revert | Public client/schema types | `session/composer/queue.ts`, `session/revert.ts`, `composer/prompt.ts`: queue/steer, restoration and loaded-history undo/redo |
| Recent sessions | Promise client and `displayLabel` from `@opencode/util/session-title-fallback` | `home/sessions/` and `session/title.ts`: directory search, 12-session cursor pages, popover and absent-title agent fallback |
| Settings/embedding | Shared UI and i18n primitives | `runtime/{persistence,platform}/`, `settings/`, `new-session/`: storage, tab isolation, desktop bridge, local welcome and title policy |
| Context usage | `@opencode/gui-extensions/usage/context-usage` | `session/header/session-context-usage-compact.tsx`: active-session token/model adapter |
| Change review | `@opencode/session-ui/session-review`, public session/VCS APIs | `review/{model,panel,parts}` follows GUI extension boundaries; `trigger-compact.tsx` mounts a lazy dialog |

## Refactor constraints

- **Product:** preserve `HISTORY_DIALOG_LIMIT = 9`, the `current/9` counter, `SET_DOCUMENT_TITLE = false`, Electron
  activation gating, source model defaults/visibility, `manageModels`, tab-specific session/draft keys, accepted prompt
  history, local welcome content and package-owned assets.
- **Runtime/history:** one disposable Solid root and shared data instance per activation own reads, subscriptions and
  cancellation. Keep reactive references, skill/selection compatibility and missing-message hydration. Start with 36
  records and follow advancing, nonempty cursors until nine user/shell roots or history end; queued prompts do not
  consume dialogs. Preserve newer live rows/events and HTTP receipts until SSE or a later snapshot acknowledges them.
- **Restoration:** preserve historical file URIs, queries, shifted mention offsets and comment compatibility through
  `composer/{prompt,comment-note}.ts`. Queue undo retains full text/file bytes, rejects hidden context and malformed or
  overlapping mentions, cancels before appending to the latest draft, restores focus and ignores stale activations.
  Undo/redo uses loaded history. Recent titles retain the local-agent fallback.
- **Scrolling:** retain shared keyboard/nested-scroll ownership, draggable scrollbar, selection/wheel/upward-key pause
  and overflow anchoring. Delayed bottom events must not cancel reading intent. Arrival, content collapse, Jump to
  latest and activation can resume following; observe late rendering and viewport/composer/dock resize.
- **Models:** keep catalog/API IDs distinct, Console metadata/grouping before search, independent collapse state,
  full-catalog switches and future-model defaults. The lazy ChatGPT-plan footer remains OpenAI active-OAuth-only,
  works with `manageModels = false`, refreshes on reconnect/connection events, retries on reopening and aborts on
  disposal. Optional footer failures do not disable selection; selection/Escape restores composer focus.
- **Requests/review:** preserve directory-wide request discovery and child-session handling. Review opens on turn
  changes; working/branch/committed reads are lazy, directory-scoped, use three context lines and share the existing
  stream. Branch includes uncommitted changes from the common ancestor; committed ends at `HEAD`. Compare/Enter
  applies the base. Keep retry, source-specific empty states, 100 ms file-event coalescing, stale-result guards and
  cancellation on source/activation change or close. Preserve drafts and bounded-patch limitations.

## Workspace files

| Area | Local boundaries | Responsibility |
| --- | --- | --- |
| Workspace files | `session/files/{file-tree-v2,file-tree-v2-model,file-tree,open-in-app,open-in-app-button,open-in-app-path,file-tabs,session-side-panel,virtual-scroll}.*`, `workspaces/files/{model,tree-store}.*` | Main-app file boundaries and shared tree styling, with a virtualized tree and lazy folder reads rooted at the active session directory. `SHOW_FILE_TREE_PANEL` controls the left panel spanning the conversation and composer. The compact model uses `model.ts` without a context provider. One replaceable preview, explicit refresh, no file watcher or route-owned tabs. Native opening is available through the desktop bridge for local servers; browser mode supports previews and copying paths. File references persist through drafts/history and are submitted with mention offsets. |

## Remaining feature decisions

These require approval and cannot be closed by a behavior-preserving refactor:

- Queue editing/reordering: the public inbox API has no atomic reorder; recreating/cancelling entries has partial-failure
  and concurrent-delivery risks.
- Provider connection and credential management.
- Staged-only review, arbitrary history ranges, comments and extension panel docking. Public VCS modes have no
  staged-only mode or end-revision parameter.
- Terminal, full usage/summary panels, browser, remote servers and extension hosting. Public built-in definitions do
  not supply the GUI renderer host and its routing, tabs, settings and server contexts.

## Validation

The catalog refactor derives server-owned view fields from public client types and uses one modality conversion for
input/output. It preserves the adapter's output and existing filenames. Catalog normalization, cache invalidation,
source immutability and model preferences remain covered by `runtime/server/global-sync/utils.test.ts`,
`providers/catalog/providers.test.ts` and `providers/models/models.test.ts`.

Validated on 2026-10-06: 392 tests across 63 files, typecheck and production build pass. On the running development
page, model search and Escape dismissal work, composer focus returns and no console errors are reported.
Production benchmarks and extended scrolling/review checks were not rerun for this catalog-only change.

Run from this repository:

```sh
bun test
bun run typecheck
bun run build
# For session/timeline changes, compare production benchmarks before and after:
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_RUNS=3 bun run bench:runtime
# Optional review-only or full UI checks:
BENCH_VERIFY_REVIEW=true bun run bench:runtime
BENCH_VERIFY_UI=true bun run bench:runtime
```

The fixture uses Playwright Chromium; `BENCH_BROWSER`, `BENCH_DIST` and `BENCH_OUTPUT` override the executable, bundle
and results path. Keep logs/screenshots under ignored `node_modules/.cache/`. Re-check the running development page
after interactions without restarting the app or server. Historical scrolling checks reproduced a 38 px initial-follow
failure on both changed and unchanged baselines; that assertion remains and no scrolling fix is claimed here.
