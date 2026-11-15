# Rho WebUI behavioral review

Reference: `agents/rho/rho-webui` in Cybros revision
`31b82029d75d1ed9626b80739e4caca16671b344`. The reference checkout and its Ruby/JavaScript
runtime are development references, not dependencies of this UI.

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

Latest validation passed: 362 UI unit tests, 54 browser component tests, 304 runtime conformance tests
with real Chromium and WebRTC, the UI type check/build, the runtime's official TypeScript check/build,
and root `bun run check`.
Root lint retains 227 existing advisory warnings and zero errors. The UI build retains its existing chunk-size advisory.

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
