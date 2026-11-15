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

Latest validation passed: 362 UI unit tests, 52 browser component tests, the UI type check/build,
and root `bun run check`. Earlier runtime conformance coverage remains unchanged.
Root lint retains 227 existing advisory warnings and zero errors. The UI build retains its existing chunk-size advisory.

Latest live testing used development Nexus at `http://localhost:3000`, the rebuilt managed OpenCode service,
and an isolated development UI. Real browser checks covered Human read-only and revoked access, draft
retention, member-token Settings, reconnecting the selected workspace/conversation, archived-chat restoration,
and saved external Bot audiences and Home Workspaces. A real runner terminal delivered shell output through
WebRTC; reload reattached to the same shell with output history and a preserved shell variable. Stop canceled
the durable task and terminated the shell process; another reload showed the stopped task without opening
a shell. These checks used the existing runtime and native terminal facilities without restarting either
managed service. Temporary workspaces, conversations, Bots and terminal tasks were cleaned up, and the runtime
default workspace and Agent were unchanged. No scheduled occurrence or deployment upgrade was started.
