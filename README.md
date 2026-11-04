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

The bridge reads `$RHO_HOME/tmp/announcement.json` (`~/.rho` by default). It uses the announced control bearer only for loopback rho status, conversation environment, and runner discovery. It authenticates to the announced Nexus origin with the Human token, validates the member profile and workspace, and discovers rho's answering agent, runner and model. The browser receives display data, scoped conversation identifiers, and chat updates through the same-origin `/api/7777` routes. Keep both credentials out of `VITE_*` variables.

## Conversation behavior

- **New session** opens a draft. The first send creates the conversation in rho's workspace and submits a reply input. A retry uses the original mutation keys. Reloading restores the current conversation and draft under the matching Nexus origin, user, workspace and agent.
- **Recent sessions** lists accessible conversations answered by the same agent, ordered by last activity. Search, keyboard navigation and pagination use the compact picker.
- The timeline shows the latest nine user dialogs and the header shows the current count out of nine. Live text follows its turn and variant. The settled Nexus turn supplies the final answer. Reconnecting reloads history and pending work.
- **Stop** cancels the conversation's active execution. Tool approvals and agent questions appear in the composer dock. 7777 requests per-turn approval under rho’s rules. The dock shows the Bash command and any explicit working directory. Allow once or Deny applies to that run and task.
- The browser release offers text chat. Attachments, queue editing, model selection, file review, undo, and export are deferred. The source-controlled `manageModels` policy remains in the model defaults. The embedding host retains document-title control through `SET_DOCUMENT_TITLE`.

## Code Layout Parity Review

7777 owns the Nexus integration. The parent UI packages continue to supply shared presentation components.

| Boundary | Responsibility |
| --- | --- |
| `server/` | Local Vite middleware, credential and workspace checks, rho runner context and tool discovery guidance, retryable Human-authored Nexus inputs, realtime subscriptions and SSE. |
| `src/nexus/` | Browser transport, scoped drafts and retry state, conversion of Nexus turns to the shared session document, and typed decision forms. |
| `src/session/`, `src/home/sessions/`, `src/composer/editor/` | Compact session layout, message timeline, welcome screen, recent-session picker and composer. These reuse public controls from `@opencode/ui` and `@opencode/session-ui`. |

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
