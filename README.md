# 7777 with Nexus and rho

The `nexus_backend` branch runs the 7777 SolidJS conversation UI in a local browser. Nexus stores conversations, authenticates the person sending each message, and dispatches replies to the answering agent registered by the local rho daemon.

## Local development

Use the OpenCode monorepo's Bun version and a checkout of the Nexus TypeScript SDK. The SDK's HTTP and realtime entry points run on the Vite server. The realtime entry point uses `ws`.

Build the SDK from its checkout with its pinned pnpm version, then link it into this package before installing workspace dependencies. The local link is ignored by Git.

```sh
cd "<nexus-checkout>/sdks/typescript"
pnpm install --frozen-lockfile
pnpm run build

cd "<repo-root>/packages/7777"
mkdir -p .local
ln -s "<absolute-path-to-nexus-checkout>/sdks/typescript" .local/nexus-sdk

cd "<repo-root>"
bun install
```

Rebuild the SDK after updating its checkout. The package exports compiled files from its `dist` directory.

With Nexus running and rho connected, check `rho status` for an adopted workspace and a declared default model. In Nexus personal token settings, issue a **member-plane** token for the Human account with access to that workspace. Put the following in this package's ignored `.env.local`.

```dotenv
NEXUS_MEMBER_TOKEN=<personal-member-token>
VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false
```

Run `bun run dev` in the package and open [the local chat](http://localhost:4777/). For a local production-build check, run `bun run build` and `bun run serve` with the same configuration. Both Vite modes provide the local API. A standalone static-file host would also need to provide that API. The packaged Electron integration is deferred.

The bridge reads `$RHO_HOME/tmp/announcement.json` (`~/.rho` by default). It keeps the control bearer on the server for scoped rho operations such as runner discovery, channel ownership, recorded file changes, and site grants. The Human member token authenticates conversation and input writes to Nexus. Browser requests use only the same-origin `/api/7777` routes. Keep both credentials out of `VITE_*` variables.

## Conversation behavior

- **Recent sessions** searches and pages through either active or archived root conversations in the current workspace. The header shows the conversation title, runner and status; **Conversation actions** renames, archives or restores it. Archived and channel-owned chats cannot receive new messages here.
- The new-chat draft and each conversation’s draft, send choices and uncertain submission receipt are stored separately under the Nexus origin, Human, workspace and answering agent. Switching chats or reloading never resubmits a message. A deliberate retry uses the original input and mutation keys.
- **Run settings** selects a runner for a new chat, the current rho preset’s model or an explicit model, and a permission policy. During a reply, Enter steers by default; choose **Queue after reply** for separate work. Ctrl/Cmd+Enter sends an immediate steer, or promotes the latest waiting steer when the editor is empty. The pending label follows the delivery mode Nexus accepted.
- The timeline retains the latest **nine** user dialogs. Streamed text and reasoning follow their answer variant. A background receipt or context summary is a disclosure, not another user dialog. Reconnecting reads the durable history and pending work again.
- **Activity** shows in-progress runs, steps waiting for attention, child conversations and communication links. Pause or resume a run, retry or abandon a failed step, or stop a branch. **Stop all work** uses the conversation cancellation command, including background work after the visible reply ends. Expand **Tools and activity** under an answer for recorded rounds, task output, captures and sealed model requests.
- The decision dock accepts typed answers or one-time approvals. For a held native `web_fetch` call, a Human with verified write access can also ask rho to allow that site until restart. Only rho derives the site rule from the held call.
- **Usage** separates the cumulative request, token and cost totals from the latest reported context window and actual model. When some requests have no price, the amount is a **known subtotal**.
- Files belong to a particular answer variant or task. Download published files, preview Markdown and images, or open a recorded Git patch and add a line comment to the current draft. Explicit file paths in an answer are resolved on its conversation runner within the bound output directory; a bare filename in prose does not create a file card.
- **Code mode** and **Subagent** in **Run settings** control the tools available to future replies in that chat. A new draft starts with rho’s defaults; an existing chat saves a switch immediately. Changes leave running replies and prepared retries alone. Code mode requires the rho Code mode plugin.
- Sending requires a rho daemon with `POST /conversations/prepare-input-policy`. After verifying Human write access, the bridge seals rho’s exact tool list and optional executor contexts into the send ticket. An empty list means no tools; omitted contexts stay inherited. If rho refuses or cannot prepare a policy, no new input is sent.
- Browser file uploads, queue reordering, undo and export remain outside this integration. The source-controlled `manageModels` policy and the embedding host’s document-title control through `SET_DOCUMENT_TITLE` remain in place.

## Code Layout Parity Review

7777 owns the Nexus integration. Its compact header menus, result disclosures and decision dock replace rho-webui’s sidebar and panel framework.

| Boundary | Responsibility |
| --- | --- |
| `server/` | Loopback middleware; Human/workspace and channel ownership checks; scoped chat writes, rho mode reads and updates, policy-bound send tickets, realtime subscriptions, execution inspection, and variant-bound artifacts and reviews. |
| `src/nexus/` | Browser transport, per-conversation drafts, turn projection, delivery and mode controls, typed decisions, usage, activity and output views. These adapters consume Nexus/rho data rather than the main app’s OpenCode runtime. |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact header, bounded timeline, paged recent picker and composer. Shared timeline, Markdown, file review, line comments, dialogs and controls come from public `@opencode/session-ui` and `@opencode/ui` exports. |

`runtime/i18n/language.tsx` owns `UiI18nBridge` and reuses the public UI template formatter and parameter type. The retained composer suggestions and recent-session picker use `MenuScroll` from `@opencode/ui`; their compact controllers retain sizing, keyboard selection and focus restoration.

The OpenCode-backed renderer and desktop packaging instructions are available on the `main` and `plm-meeting` branches. The nested Git checkout owns changes to this package.

## Verification

From the package directory, run the following.

```sh
bun test
bun run typecheck
bun run build
bun run test:components
```

For a live check, send a short text prompt, watch the streamed reply, reload, then open a fresh draft and reopen the completed chat from Recent sessions. Browser network inspection should show chat requests and an event stream under `/api/7777`. The Nexus acceptance event identifies the Human author and the turn identifies rho as the answerer.
