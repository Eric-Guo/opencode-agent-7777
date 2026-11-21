# Rho WebUI behavioral review

Reference: `agents/rho/rho-webui` in Cybros revision
`a91c63f44a0571f2a6cf08b85d7e568964441183`. The reference checkout and its Ruby/JavaScript
runtime are development references, not dependencies of this UI.

The reference WebUI changed only its Ruby lockfile from the previous baseline.
OpenCode's UI remains the owner of the browser surface. The November 21 review
passed 406 UI unit tests, 77 browser component tests, and the UI type check and build.
The runtime parity ledger at `packages/nexus-runtime/PARITY.md` in the OpenCode
checkout records the companion model adaptation and declaration checks.

An earlier verification passed all 403 UI unit tests and 69 browser component tests,
the UI type check/build, 312 runtime conformance tests with real Chromium/WebRTC,
the runtime type checks/build and root `bun run check`. The recorded Git-review
regression now clicks the shared component's line-number gutter and explicitly
waits for its comment editor. Clicking code text retains the shared component's
text-selection behavior. Comment submission
still records the correct turn and variant; the corrected case passed three repeats.

The additional pass corrected three WebUI behavior gaps: failed browser modules
retain their failed version across inventory refreshes until replacement or
disable/re-enable, blank nullable plugin text restores the default with an unset
operation, and plugin maps retain saved dynamic entries alongside declared
properties. New browser regressions failed before the fixes and passed three
repeats afterward. Failed module registration removes partial contributions;
disabling the module also clears its diagnostic.

Answer-file paths now pass unchanged to the runtime operator, which resolves them
against the conversation's stored environment instead of a global runner default.
Bridge and runtime regressions cover the differing roots, local/remote runner
selection and refusal of paths outside the bound root. The runtime pass also fixed
Telegram job prompt preservation and time/control argument validation. These checks
used local protocol/browser fixtures without restarting or changing either live
service. No new public API or configuration key was needed.

Live verification after rebuilding the managed service used Nexus at
`http://localhost:3000` and an isolated development UI. A real answer's file link
previewed and downloaded exact bytes from its conversation's bound directory,
including after reload; the service refused parent, hidden and outside-root paths.
Nullable plugin text saved an unset operation and restored its runtime default.
The disabled MCP extension's saved dynamic URL field remained editable, persisted
across reload and was restored afterward.

That live cross-plugin workflow exposed one additional bug: selecting another
plugin changed its heading but retained the previous configuration form and draft.
The configuration form now uses a Solid Show keyed by extension ID, so changing
extensions replaces its form and draft while refreshing the same extension keeps
unsaved edits. A browser regression failed before the fix; it and the existing
refresh/draft regression each passed three repeats afterward. The live switching
and refresh workflow also passed. The full UI suite passed 403 unit
and 69 browser tests, type checking and build; root `bun run check` also passed.

The production Telegram parser created/edited real Nexus schedules with exact
multiline prompts and rejected malformed controls without changing their state;
the UI retained the prompt and paused state after reload. This exercised parser
calls with a temporary owner Bot, without external Telegram transport. The module
lifecycle check used a browser-only controlled module alongside the live service
inventory, verifying rollback, retained failure, disable/re-enable and replacement
without installing a service package. Temporary schedules, Bot, workspace, profile
records and files were removed; plugin values were restored and pairing/defaults
were unchanged.

This pass also checked the reference WebUI's navigation/history, queued inputs,
approval/questions, activity and output inspection, memory, schedules, Bots/Presets,
extension slots/settings and terminal contracts against the existing UI and bridge
owners below. The runtime review corrected ACP permission-title fallback, Unicode
MCP naming and whitespace in T3 selections. Live Bot creation exposed a separate
handle mismatch: stable names must reserve four of Nexus's 32 characters for `bot-`.
The public creation/duplication schemas and UI now enforce the 28-character limit;
duplicate names reserve space for `-copy`. A schema regression and three repeated
browser cases cover both paths. Client generation was run from `packages/client`.

Live checks used the standalone UI's existing server-side Human credential. A
model-driven Code Mode call printed one approved bash result, retained structured
false, and supplied an unpredictable UUID to the next sealed request and the UI
answer after reload. A scratch counter confirmed one bash execution. The production
terminal transport retained shell state/output across reattachment and Stop settled
the task. Memory selection, schedules, file publication/download and Bot Home
Workspace/Preset/duplication checks also passed. Temporary resources were removed;
service pairing and defaults were preserved without restarting the service.

The reference production source and tests are unchanged from the previous baseline;
the intervening changes only update Ruby dependencies. Task inspection now also
shows the runtime's structured output, preserving false, zero and null separately
from ordered printed output. The existing approval/reload browser regression covers
all three values without another submission or decision. The scoped bridge test
verifies that task projection retains structured false.

| Reference behavior                                                                                                      | Nexus UI owner and evidence                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace selection, new workspace, browser history, remembered selection, conversation and panel links                 | `nexus/navigation.ts`, `management/shell.tsx`; browser regressions cover reload, Back/Forward, cache restoration, workspace changes and Bot/plugin item links. A new workspace opens without changing the runtime default.                                                                                                                                         |
| Persistent history, drafts, message admission, uncertain sends, queue/steer delivery, modes and approvals               | `nexus/controller.ts`, `server/middleware.ts`, `server/input-policy.ts`, `server/reply.ts`; controller, bridge and browser regressions preserve captured retries. Fresh drafts reread the runtime's mode defaults and availability.                                                                                                                                |
| Read-only Human/Bot/channel/Side views, archive state, Stop and artifact access                                         | `server/nexus.ts`, `nexus/controller.ts`, scoped bridge checks and browser regressions; Human access governs edits, Stop and terminal signaling. Access revocation closes the feed and blocks captured retries without losing drafts. Full-access archived chats retain Restore. Private Bots retain the channel boundary.                                         |
| Parent snapshots, background receipts, retained/pruned turns, execution inspection, branches, typed questions and usage | `nexus/chat.ts`, `transcript.tsx`, `activity.tsx`, `decision.tsx`; existing projection, controller, request-prompt and browser suites exercise these production components.                                                                                                                                                                                        |
| Published files, text paths, image/Markdown previews and recorded Git review                                            | `nexus/output-files.tsx`, `server/outputs.ts`, `server/activity.ts`; output ownership and slow-variant browser regressions retain each capture with its answer.                                                                                                                                                                                                    |
| Conversation memory bindings                                                                                            | `nexus/memory-bindings.tsx`, `server/memory.ts`; automatic/custom/disabled selections, scope and collection sources, optional subjects, access, collection pagination and effective-state display. Conflicts preserve the draft; read-only views expose no save action.                                                                                            |
| Workspace and conversation schedules, models, rules, executions and lifecycle controls                                  | `management/schedules.tsx`, scoped Human reads in `server/management.ts`, and the runtime schedule commands; active rows sort by next run, finished/read-only rows keep history, executions page, and model edits preserve unchanged captured controls.                                                                                                            |
| Bots, Home Workspace, Presets, roles, welcome messages, history and shared policy                                       | `management/bots.tsx`, `presets.tsx`; item-link regressions preserve saved selections while catalogs arrive. External audiences stay fixed, unavailable Home Workspaces remain visible, and new conversations require an available Home Workspace. New Bot restores its default Preset, Subagent setting and empty history.                                        |
| Plugin configuration, secret retention, packages and dynamic browser contributions                                      | `management/plugins.tsx`, `fields.tsx`, `modules.ts`, `slot.tsx`; browser regressions cover failed drafts, retained secrets, relative imports, replacement, disable and item restoration.                                                                                                                                                                          |
| Settings, account actions, integrations, providers, terminals and deployment updates                                    | `management/settings.tsx`, `integrations.tsx`, `providers.tsx`, `terminals.tsx`, `updates.tsx`; member-token Settings skips unavailable persona calls, and reconnect retains the selected workspace/chat. Server and browser tests retain terminal authority boundaries. Upgrade recovery keeps the checked request across reload and never resubmits from a read. |

The compact interface continues to use public OpenCode UI/session components. Its management pages and
fragment addresses preserve the embedding host's path, query and relative assets. OpenCode owns host updates,
local bridge authentication and Human sign-in; the browser receives no Nexus or service credential. Rho's
separate web password gate and installer are not duplicated. The source-controlled model-management policy,
host document-title control and existing nine-dialog history behavior are retained.

The small supporting Protocol change adds schedule models, execution cursors and the runtime's conversation
default read. Clients were regenerated through `packages/client`; generated files were not edited manually.
Nexus API clients own memory selection, schedule reads and permissions. OpenCode Code Mode remains the executor.

Earlier validation passed: 403 UI unit tests, 64 browser component tests, 309 runtime conformance tests
with real Chromium and WebRTC, the UI type check/build, the runtime's official TypeScript check/build,
and root `bun run check`.
Root lint retains 227 existing advisory warnings and zero errors. The UI build retains existing CSS and chunk-size advisories.
An unchanged attachment-menu focus test failed in the first browser run, then passed three isolated repeats
and the complete browser rerun. This alignment check used local fixtures and did not change live account state.

Latest live testing used development Nexus at `http://localhost:3000`, the rebuilt managed OpenCode service,
and an isolated development UI. Real browser checks covered Human read-only and revoked access, draft
retention, member-token Settings, reconnecting the selected workspace/conversation, archived-chat restoration,
and saved external Bot audiences and Home Workspaces. A real runner terminal delivered shell output through
WebRTC; reload reattached to the same shell with output history and a preserved shell variable. Stop canceled
the durable task and terminated the shell process; another reload showed the stopped task without opening
a shell. These checks used the existing runtime and native terminal facilities without restarting either
managed service. Temporary workspaces, conversations, Bots and terminal tasks were cleaned up, and the runtime
default workspace and Agent were unchanged. No deployment upgrade was started.

The joint runtime/UI review also found that seeding a title from the first prompt suppressed the runtime's
automatic title attempt, and that an idle metadata update could remain invisible without a transcript event.
New chats now leave the title empty; the selected conversation rereads HTTP state every three seconds,
with cleanup on navigation, teardown and authoritative access denial. A clock-driven browser regression
checks metadata and access changes without stream events and verifies that access loss stops the reads.

Joint live checks generated a runtime title and observed it before and after reload; drove native OpenCode
Code Mode through nested bash calls, Human approvals, file publication and a scoped download with matching
bytes; created, edited, paused, resumed and explicitly ran a scheduled job, then opened its execution; and
persisted disabled, custom and automatic memory selections. Terminal connection, reload/reattachment and
Stop were rerun successfully. Code Mode's declaration now explicitly explains that returned JSON is UI-only
and that results needed by the model must be printed rather than obtaining text by repeating effects.
Temporary workspaces, schedules and terminal tasks were removed, with the managed services and defaults intact.
After rebuilding and restarting the managed service, a live UI request verified that the model received
the updated Code Mode declaration. One approved native bash call printed an unpredictable token; Code Mode
printed the observed result and retained literal `false` as structured output. The next sealed model request
contained the token, and the UI answer returned it and survived reload. The scratch execution counter and
durable task records both confirmed exactly one bash execution. The temporary workspace and scratch files
were cleaned up, with service pairing, the Agent and the default workspace preserved.

`component-tests/nexus-chat.spec.ts` now covers the same UI workflow with deterministic bridge records:
one input and approval, printed Code Mode output, the next sealed model request, and reload without
resubmission. Runtime regressions verify the published output instructions, one native child operation
under duplicate notifications, and printed observations alongside structured false, zero and null.


The built-in execution settings pass exposes Coding, Checkpoints and Lifecycle
hooks through the existing Plugins form. Atomic hook groups use the JSON editor,
so required fields are saved together. A browser regression drives the actual
runtime descriptors and configuration writer to verify defaults, save/reset,
persistence across reload, malformed JSON and draft isolation between plugins.
The keyed form remount correction already present in the working tree was retained.
Validation passed all 403 unit tests, 70 browser tests, the UI type check and build,
and the root check, alongside 316 runtime conformance tests. Runtime settings and
execution remain owned by `packages/nexus-runtime`; no new bridge endpoint is needed.

The new settings browser case passed ten repeats with two workers. Live source-runtime
checks separately verified native Code Mode output, configured and explicit shell
timeouts, Until, lifecycle hooks, checkpoint restoration, disabled announcements
and a Human-approved bash task. Temporary Nexus resources were removed without
restarting the installed service or changing its pairing and defaults.


After the managed service was rebuilt and restarted, live browser verification
confirmed Coding and Lifecycle hook settings save/reload through the production
bridge. The resulting bash timeout was enforced by the installed runner. A real
model Code Mode call ran bash once, retained structured false and produced an
answer that survived reload. Human approval, captured timeout changes, checkpoint
budgets/restore/disablement, coding disablement, MCP-backed lifecycle hooks and
Until's configured timeout were checked against live Nexus. Original settings and
pairing were restored and temporary workspaces/resources were removed. The service
retained a generic last-error marker that predated verification; HTTP inbox reads
and all tested live behavior passed.
