# Code Layout Parity Review

7777 is an independent Git repository. It consumes public workspace exports and keeps its own source and assets;
there are no runtime or build imports from `packages/app`. Matching filenames indicate local ownership, not reuse.
Paths below are relative to `src/` unless a package is named.

The original assessment used parent `5d84cc330f` and compact `ea429ea` (2026-10-01), including GUI extension
PR #52369. Prompt restoration was compared with parent `7ebf66c36f` (2026-10-02). The scrolling follow-up below
compares parent `59b3b8dd0c` and compact `ec4fc8c` (2026-10-03). Console grouping follows parent `d84cecc5bd`,
starting from compact `fe8b29e` (2026-10-05). The ChatGPT-plan footer follows the same parent, starting from meeting
`dc21ead` (2026-10-05). These are scoped comparisons, not a full audit of all subsequent
upstream changes. Earlier migration notes and measurements remain in this document's Git history.

## Shared packages and local ownership

| Area | Public reuse | Remaining local responsibility |
| --- | --- | --- |
| Timeline | `@opencode/session-ui` timeline, document, actions, context, markdown and cards | Nine-dialog projection, reasoning visibility, revert presentation |
| Scrolling | `createAutoScroll` from `@opencode/ui/hooks` | Activation reset, viewport observation, Jump to latest control |
| Session runtime | `createData` from `@opencode/client/solid` | Activation lifecycle, bounded hydration, optimistic presentation, compatibility rows |
| Transport/platform | `@opencode/client/promise` | Authenticated request queue, one SSE stream, desktop RPC, Electron gate, embedded mount |
| Models/providers | Shared data location resources, including lazy integration reads, and UI primitives | Source defaults/visibility, Console grouping, server precedence, variants, manager gate, selection and ChatGPT-plan footer |
| Composer | Shared agent/skill/command resources, attachment cards and controls | Editor, request serialization, accepted history, drafts, independent catalog failures |
| File mentions | `encodeFilePath` from `@opencode/util/path` and shared icons | Directory search, cancellation, absolute server URI composition |
| Requests | Shared `DockPrompt` and `DockSurface` | Directory-wide discovery, child-session selection, replies, notifications, web-search handoffs |
| Queue/revert | Public client/schema types | Queue/steer actions, lossless undo, loaded-history undo/redo, activation guards |
| Recent sessions | Promise client | Directory-bound title/ID search, 12-session cursor pages, header popover |
| Settings/embedding | UI controls and shared i18n primitives | Synchronous storage formats, tab isolation, preferences, welcome content, title policy |
| Context usage | `@opencode/gui-extensions/usage/context-usage` | Active-session token/model adapter in `session/header/session-context-usage-compact.tsx` |

## Intentional constraints

- Keep `HISTORY_DIALOG_LIMIT = 9`, the `current/9` header, and cursor hydration without visible history pagination.
- Keep `SET_DOCUMENT_TITLE = false`, Electron activation gating, and the embedding host's title ownership.
- Keep source-controlled model defaults/visibility and `manageModels`.
- Keep tab-specific session/draft keys, accepted prompt history, local welcome content, and package-owned assets.
- Keep directory-wide request discovery; shared per-session request methods do not replace that contract.

## Runtime and restoration contracts

`runtime/server/runtime.ts` owns one disposable Solid root and shared data instance per activation, plus its abort
signal, subscriptions and refresh work. The compact store publishes derived views; streamed content retains shared
reactive references. Five catalogs load for the composer and models; integration metadata loads only while the
model selector is open with an OpenAI model selected, without full-location or extension bootstrap.

The shared layer handles 35 of the former reducer's 36 event kinds. Local compatibility covers skill activation,
selection predecessors/metadata, and hydration for missing messages. History starts at 36 records and follows
cursors until nine user/shell roots are present or history ends. Empty/duplicate pages and repeated cursors stop
hydration; queue items do not consume dialogs. Live rows and events newer than a snapshot survive refreshes.
Temporary HTTP mutation receipts remain until SSE or a subsequent snapshot acknowledges them.

`composer/prompt.ts` reconstructs historical and queued prompts using the existing compact draft format. It restores
file, agent and skill mentions; historical files retain their server URI/query, while queued files retain their bytes.
Historical offsets may be recovered from visible text. Queued restoration requires valid, non-overlapping ranges
and refuses hidden context that the draft cannot preserve. `session/composer/queue.ts` owns cancellation, appending
to the latest draft, focus restoration and activation guards. Restoration follows successful cancellation only.

## Scrolling follow-up (2026-10-03)

`session/timeline/interaction.ts` now delegates following, wheel handling, text-selection pause, nested scroll-region
handling and overflow anchoring to `createAutoScroll`. The old 250 ms pointer-gesture timer is removed. Reading
position survives streamed content; **Jump to latest** resumes following. Activation changes reset following, and
content/viewport resize observation covers late rendering and composer or request-dock height changes.

The compact screen owns the resume button and keeps the bounded renderer. The main app places its control in a
virtualizer; 7777 does not need that dependency for nine dialogs. Timeline scrolling uses immediate positioning so
CSS smooth scrolling cannot turn intermediate automatic scroll events into a false user pause. Keyboard activation
and English fallback cover the new control. Existing timeline actions, drafts, requests and header controls remain.

## Remaining gaps

- Queue editing and reordering. The public inbox API has no atomic reorder operation; upstream recreates a suffix
  of prompts and cancels the originals. This requires separate work on partial failures and concurrent delivery.
- Provider connection and credential-management flows.
- Review/diff panels, terminal, full usage/summary panels, browser, remote servers and the extension host.
  The GUI extension renderer host lives in `packages/app` and depends on app routing, tabs, settings and server
  contexts. Public built-in definitions alone do not supply that host.

## Console grouping follow-up (2026-10-05)

`providers/catalog/console.ts` and `providers/models/provider-group.tsx` now follow the main app's Console
workspace boundary. The existing catalog adapter preserves integration and canonical provider identity. The manager
detects the workspace before filtering and nests its providers under a collapsible workspace heading. Unrelated,
direct, and incomplete provider catalogs retain their existing sections. Shared local headers and ordering remove
duplication; nested groups retain 7777's provider switches, full-catalog search toggles, and future-model defaults.
The `manageModels` gate, source configuration, selection, and persistence formats are unchanged. New copy uses
the existing English fallback until translated. No app imports, new catalog requests, or dependencies were added.

## ChatGPT-plan footer follow-up (2026-10-05)

The model selector now shows **Using ChatGPT plan** and a keyboard-accessible **Manage usage** link when the selected
provider is `openai` and its first active integration connection is an OAuth credential. An inactive OAuth connection
behind an API key, an environment connection, or a Console provider does not enable the footer. The link uses the
local `runtime/platform/external-link.tsx` boundary and opens ChatGPT usage settings in a separate tab.

Connection reads belong to `providers/catalog/integrations.ts`, using the public client's shared integration resource.
The selector view receives the resulting flag and reports its open state. The compact adapter reads only while needed,
refreshes through the existing SSE stream on credential/integration changes or reconnect, and reads again on reopening.
Loading or failed reads hide the optional footer without blocking model search or selection. A newer event or scope
invalidates display readiness, so late responses cannot show a previous connection or workspace. The runtime's abort
guard also covers integration reads. No connection metadata is persisted locally, and no additional stream, polling,
app import, or dependency was introduced. The footer remains available with `manageModels = false`.

## Validation and coverage

| Contract | Coverage owner |
| --- | --- |
| Shared projections, live snapshots, cursor hydration, HTTP/SSE races, disposal | `runtime/server/runtime.test.ts`, global-sync suites |
| Submission, draft restoration, references, queue cancellation, revert | `composer/{prompt,request,submit}.test.ts`, queue and revert suites |
| Catalog defaults, request deduplication, independent failures, isolation | Composer/provider catalog suites |
| Console identity, direct-provider exclusion, metadata preservation | `providers/catalog/console.test.ts`, global-sync utils suite |
| Active OAuth detection, lazy reads, connection events, stale responses, optional failures | `providers/catalog/integrations.test.ts`; catalog disposal in `runtime/server/runtime.test.ts` |
| Nine-dialog projection, shell roots, revert boundary | `session/timeline/model-compact.test.ts`, session-domain suite |
| Following, pause/resume, streamed growth, selection, resize, activation reset | Production fixture in `scripts/runtime-benchmark.ts` |
| Directory-wide requests, persistence, embedding/platform behavior | Request, storage/schema, platform and layout suites |

Current meeting validation: 482 top-level tests across 73 files, typecheck, and production build pass. Reactive suites
run with Solid's browser condition through the normal test command. A production browser fixture verified the footer,
keyboard access, active OAuth/API-key changes, metadata failure and recovery, search, and the disabled model-manager
gate. The running homepage's model search and Escape focus restoration were also checked without changing its selected
model or restarting its app/server. Fixture files and screenshots are ignored under `node_modules/.cache/plan-parity/`.

The benchmark fixture now supplies meeting recorder, project and file-tree reads and explicit fixture storage keys.
Five runs of the ordinary benchmark passed for each bundle. Before/after medians were 171.5/176.1 ms for entry,
153.9/152.8 ms for switching, and 48.4/48.3 ms for 160 text deltas; this small sample establishes no performance change.
The extended `BENCH_VERIFY_UI=true` run currently fails its first scroll-distance assertion (38 px versus less than
10 px) on both unchanged `dc21ead` and this change. This existing scrolling gap remains unresolved; the assertion is
retained. The new integration-disposal regression also fails against `dc21ead` and passes with the abort guard.

The earlier Console grouping validation passed 372 top-level tests across 60 files. The metadata regression fails against the previous
adapter. An isolated browser fixture verified grouping, search with the root filtered out, independent collapse-state
restoration, toggling hidden search results, and visibility of newly added models. The running homepage's selector,
search, and Escape focus restoration were also checked; its app and server processes were left running. The fixture
and screenshot are ignored artifacts under `node_modules/.cache/provider-parity/`.

For the earlier scrolling follow-up (2026-10-03), the production fixture verified the real bundle against an isolated
HTTP/SSE endpoint and blocked external requests. Five samples per build on the same machine produced these medians:

| Fixture | Before | After |
| --- | --- | --- |
| Session entry | 134.9 ms | 133.9 ms |
| Session switching | 153.6 ms | 152.5 ms |
| 160 text deltas | 42.8 ms | 41.9 ms |

This small local sample does not establish a performance change. Results and screenshots are ignored artifacts
under `node_modules/.cache/scroll-parity-*`. The new scroll assertions failed on the original bundle and pass after
the refactor. Prior shared-client tests had workspace-location and browser-condition background-shell failures;
7777's runtime suites cover its adopted behavior without changing or suppressing those upstream tests.

```sh
bun test
bun run typecheck
bun run build
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_VERIFY_UI=true bun run bench:runtime
```

The browser fixture uses Playwright Chromium. Set `BENCH_BROWSER=<chromium-executable>` for an existing installation,
`BENCH_RUNS` for the sample count, `BENCH_OUTPUT` for results, and `BENCH_DIST` for another production bundle.
