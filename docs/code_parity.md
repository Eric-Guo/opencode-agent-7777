# Code Layout Parity Review

Source assessment: parent monorepo `5d84cc330f`, compact app `ea429ea` (2026-10-01).
The parent includes [GUI extension PR #52369](https://github.com/anomalyco/opencode/pull/52369), merged as `f406d93a66`.
The table describes the resulting 7777 implementation against that inspected baseline.
Prompt restoration was additionally compared with parent `7ebf66c36f` and compact `4a4fb95` on 2026-10-02;
the follow-up below records that refactor and its validation.
This assessment distinguishes public-package reuse from matching local filenames.
Paths are relative to `<repo-root>/packages/7777/src` unless a package is named.

## Package boundaries

`@opencode/gui-extensions` exports built-in renderer/main definitions and its SDK, not the app's composer,
model picker, or request docks. Its renderer host remains in `packages/app/src/runtime/extension` and depends on
app routing, tabs, settings, and server contexts. Adding that host would not replace the compact session loop.
7777 consumes public workspace exports and does not import `packages/app` or GUI extension internals.

| Subsystem                          | Owner and public reuse                                                                                      | Compact responsibility                                                                                                    | Contract coverage                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Timeline and message rendering     | `@opencode/session-ui/timeline`, `/document`, `/actions`, `/context`, `/markdown`, attachment/comment cards | Nine-dialog projection, reasoning visibility, scroll interaction, revert presentation                                     | `session/timeline/model-compact.test.ts`, `session/session-domain.test.ts`, shared session-ui component tests |
| Session runtime                    | `createData` from `@opencode/client/solid`, instantiated in `runtime/server/runtime.ts`                     | Activation lifecycle, bounded history hydration, optimistic presentation, missing-event hydration, unsupported skill rows | `runtime/server/runtime.test.ts`, bootstrap/event/stream tests, submission, queue, and revert suites          |
| Transport and platform             | `@opencode/client/promise`                                                                                  | Authenticated request queue, one SSE stream, desktop RPC, Electron gate, embedded mount                                   | `runtime/server/{api,client-compact,request-queue,sync-session-compact}.test.ts`, platform bridge/RPC tests   |
| Models and providers               | `Data.location.provider` and `.model` from `@opencode/client/solid`; UI primitives from `@opencode/ui`      | Source defaults, server default precedence, visibility, variants, model manager gate and selection                        | Provider catalog, model selection, search, variant, and persistence tests                                     |
| Composer and suggestions           | `Data.location.agent`, `.skill`, and `.command`; shared attachment cards and controls                       | Local editor, prompt/reference serialization, accepted history, draft storage, independent catalog failure states         | `composer` editor, catalog, prompt, request, submission, and history suites                                   |
| File mentions                      | `encodeFilePath` from `@opencode/util/path`; shared file icons                                              | Directory search, cancellation, absolute file URL composition                                                             | `workspaces/files/{path,model}.test.ts`                                                                       |
| Permissions, questions, web search | `@opencode/session-ui/dock-prompt`, `@opencode/ui/dock-surface`                                             | Directory-wide snapshots, child-session request selection, replies, notifications, form handoffs                          | Request tree, permission/form sync, and web-search suites                                                     |
| Queue and revert                   | Shared client/schema types                                                                                  | Queue/steer actions, successful-cancellation draft restoration, loaded-history undo/redo, file/agent/skill restoration, activation guards | `composer/prompt.test.ts`, `session/composer/queue.test.ts`, `session/revert.test.ts`, `composer/submit.test.ts` |
| Recent sessions                    | Shared promise client                                                                                       | Directory-bound title/ID search and 12-session cursor pages; header popover                                               | `home/sessions` index, search, and controller suites                                                          |
| Persistence and settings           | UI controls and shared i18n primitives                                                                      | Existing synchronous storage keys/formats, tab isolation, language and preferences, reasoning toggle                      | Storage, schema, drafts, settings, and model preference tests                                                 |
| Welcome and embedding              | Package-owned assets and UI primitives                                                                      | Tab-configured local agent, welcome markdown/questions, title policy and `#oc-agent` styles                               | Agent configuration, directory, layout, platform, and browser checks                                          |
| Extension features                 | Public SDK and built-in definitions exist; unused here                                                      | Files/review panels, terminal, usage, summary, browser, remote servers and extension host remain outside current features | Upstream extension/app suites; no duplicate compact implementation                                            |

## Intentional constraints

- Keep `HISTORY_DIALOG_LIMIT = 9`, the `current/9` header, and cursor hydration without visible history pagination.
- Keep `SET_DOCUMENT_TITLE = false` by default, Electron activation gating, and the embedding host's title ownership.
- Keep source-controlled model defaults/visibility and `manageModels`.
- Keep tab-specific session/draft storage keys, accepted prompt history, local welcome content, and package-owned assets.
- Keep directory-wide request discovery; shared per-session request methods do not replace that contract.

## Runtime and compatibility ownership

The runtime follows the main app's `runtime/server/runtime` boundary. Each activation owns a disposable Solid root,
shared data instance, abort signal, subscriptions, and scheduled refresh work. `currentRuntime()` exposes its API,
data, event bridge, and identity. The compact store publishes derived views of shared records; streamed message
content retains shared reactive references. It does not copy the whole data store on deltas.

The shared layer covers 35 of the former reducer's 36 event kinds. Compact handling retains immediate
`session.skill.activated` rows, selection predecessors/metadata, and targeted hydration for missing messages.
History starts at 36 records and follows cursors until nine distinct user/shell roots are present or history ends.
Empty pages, repeated cursors, and pages containing only already-loaded IDs terminate hydration. Queue items never
consume visible dialogs. Live assistant, shell, and compaction rows survive incomplete snapshots; completed server
records replace them, except when a newer event overtook the read.

Successful HTTP mutations use temporary inbox receipts until SSE or a subsequent snapshot acknowledges them.
Drafts, request construction/configuration ordering, attachment previews, accepted history, queue undo, and revert
presentation remain local. Activation identity guards prevent old responses from affecting a later activation,
including returning to the same session. Connection events stay compact, avoiding shared project/VCS bootstrap.
Only the five catalogs used by 7777 are requested; no full-location or extension-host bootstrap is introduced.

### Prompt restoration follow-up (2026-10-02)

Historical and queued prompt reconstruction now share `composer/prompt.ts`, following the main app's prompt
boundary while retaining the existing compact draft format. The queue controller in `session/composer/queue.ts`
still owns server cancellation, appending to the latest draft, focus restoration, and activation guards.
All code remains package-owned and uses public client/schema types; there are no imports from `packages/app`.

- Message Undo and Revert restore file, agent, and skill mentions. File references retain their server URI and
  query string. Historical presentation text remains unchanged; shifted mention offsets are recovered in order,
  following the main app's behavior. Missing or malformed references leave the visible text intact.
- Queued Undo now accepts mentioned agents and skills alongside file mentions and inline attachments. It keeps
  the full model-visible text, including notes omitted by the queue preview, and the queued file bytes. Cancellation
  is refused for hidden context without a mention or for invalid/overlapping ranges, so unsupported context stays
  queued. Restoration still happens only after successful cancellation.
- Existing draft keys, accepted history, attachment handling, delivery preferences, and the nine-dialog window
  are preserved. Queue editing and reordering remain outside this change.

`composer/prompt.test.ts` owns historical reconstruction and persistence/resubmission coverage.
`session/composer/queue.test.ts` owns lossless cancellation, combined mention validation, merging, and stale-response
coverage. The existing revert suite continues to own Undo/Redo transitions and error handling. Regression tests
for structured message and queue restoration failed before the implementation and pass afterward.

Validation: `bun test` passes 370 top-level cases across 59 files; `bun run typecheck` and the standalone-browser
production build pass. An isolated browser fixture verified queued Undo, draft reload, historical Undo, rendered
file/agent/skill references, and the submitted request payload. The existing production fixture also passed its
UI assertions. The user's running app and server were left running.

Ten samples per build on the same machine and installed Chromium produced these medians:

| Fixture           | Before | After |
| ----------------- | ------ | ----- |
| Session entry     | 136.5 ms | 138.2 ms |
| Session switching | 146.8 ms | 148.8 ms |
| 160 text deltas   | 43.2 ms | 44.0 ms |

The differences are small local timing variations, not a demonstrated performance change. Raw results and the
browser screenshot remain in ignored `node_modules/.cache/parity-{before,after}.json` and
`node_modules/.cache/prompt-parity-browser.png`.

### Test ownership after removal

| Removed local code                                          | Contract coverage now                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-reducer-compact.ts` and its reducer-specific tests | Actual shared projections in `runtime/server/runtime.test.ts` and `global-sync/event-reducer-session.test.ts`: text/reasoning, tools/files/retries, shells/compactions, instructions/movement, selections, skill compatibility, inbox lifecycle   |
| Message-cache state, snapshot merging, and cursor loader    | Runtime tests for live/concurrent snapshots, completion, missing admission, duplicate/empty pages, queue exclusion, HTTP/SSE races, input immutability, disposal; `global-sync/session-messages.test.ts` covers the remaining presentation mapper |
| Global refresh timer                                        | Activation-owned scheduling, abort/disposal tests, and `sync-session-compact.test.ts`                                                                                                                                                             |
| Raw composer/provider catalog loaders                       | Shared-resource catalog tests for default ordering, canonical location aliases, request deduplication, directory/activation isolation, and independent failures                                                                                   |

Submission, queue, revert, child-session request selection, web-search handoff, persistence, and embedded/platform
suites remain in 7777. Reactive suites run with Solid's browser condition; the normal `bun test` command launches
those suites in subprocesses, so its top-level count includes wrapper tests rather than every nested case.

### Validation

Initial compact baseline: 462 tests, typecheck, and production build passed. The shared client's unchanged
`test/solid-data.test.ts` has one workspace-location failure (27 pass/1 fail); browser conditions additionally
expose its background-shell assertion failure (26 pass/2 fail). Compact runtime tests explicitly verify adopted
single-directory behavior and background shell metadata/completion, using plain snapshots for proxy assertions.
Those upstream failures are recorded rather than suppressed or changed in another package.

Run the package checks after a migration:

```sh
bun test
bun run typecheck
bun run build
bun --conditions=browser test src/runtime/server/runtime.test.ts src/composer/catalog-compact.test.ts src/providers/catalog
```

The production browser fixture serves its own HTTP/SSE endpoint and blocks external requests. It measures entry,
session switching, and 160 streamed text deltas, then optionally checks commands, skill/agent filtering, switching
back to the original session, the nine-dialog counter, and host title ownership. It neither starts nor restarts the
user's app/server. Results and screenshots default to ignored `node_modules/.cache` paths.

```sh
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false bun run build
BENCH_VERIFY_UI=true bun run bench:runtime
```

The fixture uses Playwright Chromium. Set `BENCH_BROWSER=<chromium-executable>` if using an existing installation,
`BENCH_RUNS` for the sample count, `BENCH_OUTPUT` for a JSON result path, and `BENCH_DIST` for another production
bundle. Run baseline and changed bundles against the same fixture, on the same machine, without concurrent builds.
Timing is a local regression check, not a general device or network performance claim.

### Recorded results (2026-10-01)

All three migration stages passed package tests, typecheck, and production builds. Final validation:
`bun test` passes 362 top-level cases across 59 files, including subprocess wrappers;
the explicit browser-condition run passes 158 cases across 14 runtime, catalog, submission, queue, revert, and request
files. Production browser assertions pass after each interaction, including returning to the same session.

The original pre-migration run had entry/switch/streaming medians of 128.3/147.5/119.6 ms (10 samples).
For the final comparison, an isolated production build of `ea429ea` and the changed build used the identical updated
fixture and the same installed Chromium headless shell on macOS arm64, with 20 samples each:

| Fixture           | Baseline median | Final median | Baseline range | Final range    |
| ----------------- | --------------- | ------------ | -------------- | -------------- |
| Session entry     | 127.4 ms        | 130.7 ms     | 123.7–139.1 ms | 127.4–134.5 ms |
| Session switching | 147.8 ms        | 146.1 ms     | 143.5–157.2 ms | 138.7–276.1 ms |
| 160 text deltas   | 120.6 ms        | 42.1 ms      | 118.6–125.0 ms | 41.5–44.6 ms   |

Entry increased by about 3 ms within the observed baseline variation; the switching median stayed within that variation.
The first two switches in that final batch took 276 and 267 ms. A further 10-sample diagnostic run after rebuilding
had a 144.7 ms switching median and one 266.4 ms outlier. The slow operation spent 241.7 ms inside Playwright's
`option.click()`; subsequent DOM waits remained between 23.6 and 29.4 ms (median 24.7 ms). The median click took
120.2 ms. Thus the extra time occurred inside the browser click operation, rather than the subsequent DOM wait;
its precise cause remains unconfirmed. These occasional click outliers are retained in the reported range.
Streaming latency fell by about 65%. Alternating baseline/changed batches reproduced the streaming difference.
Entry and switching medians stayed within baseline variation; click-time outliers are the remaining measurement limitation.
Raw local results and screenshots remain in
`node_modules/.cache/runtime-*.{json,png}`; the fixture script is package-owned source for reproducing the measurements.
