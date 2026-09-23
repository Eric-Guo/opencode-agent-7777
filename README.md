# @opencode/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

This package is the SolidJS/Vite UI for the `7777` agent.

## Develop

```bash
# read <opencode-state-folder>/service.json
export OPENCODE_SERVER_PASSWORD=here
# field url in service.json
export VITE_OPENCODE_SERVER_PORT=4096
export VITE_OPENCODE_7777_ACTIVATE_IN_ELECTRON_ONLY=false
bun run dev
```

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

## Open Source Notes

This package should not depend on a contributor's local home directory or private company resources. Use
`<repo-root>` in documentation when referring to the monorepo checkout, and keep private agent prompts, internal
network paths, credentials, and localStorage dumps out of commits.

The production/private 7777 agent prompt is not included verbatim. A sanitized reference template lives at
`docs/reference/7777-agent.md`; copy and adapt it for a local OpenCode agent configuration if needed.

## Code Layout Parity Review

Intentional differences from `<repo-root>/packages/app` (baseline `4bc7c1750f`, 2026-09-18).
Paths below are relative to `src/` unless noted; `-compact` names identify narrower responsibilities.
Matching paths describe local module boundaries, not imports from `packages/app`. Shared session rendering comes
from `@opencode/session-ui`; 7777 does not need `packages/app` at runtime or build time.

| Area | Compact or 7777-only boundaries | Remaining difference |
| --- | --- | --- |
| Runtime and platform | `runtime/platform/desktop-rpc-client.ts`, `runtime/platform/platform-bridge.ts`, `runtime/server/resolver-compact.ts` | One embedded mount (`#oc-agent`), en/zh only, one server; no router, server registry, or full platform context. The local bridge uses the desktop host's structured-clone RPC protocol for initialization, native attachments, source paths, and clipboard images. `SET_DOCUMENT_TITLE` defaults to `false` so the embedding host controls the title. |
| Server and session state | `runtime/server/{client,directory-client,sync-session,session-store,session-reducer}-compact.ts`, compact bootstrap/event/message-cache/queue files in `runtime/server/global-sync/` | One server, SSE stream, and active session. Compact clients own transport-queue sharing; the current-message cache owns inbox hydration and reconciliation. No multi-server reactive data layer or SDK provider. |
| Providers and models | `providers/catalog/{providers.ts,loader-compact.ts}`, `providers/models/default-config.*`, `runtime/persistence/storage-compact.ts`; package-root `scripts/apply-model-config-dump.ts` | Directory catalog reads and provider ordering use the main app's `providers.ts` boundary; the compact loader owns active-session refresh admission, status, and selection. Model UI imports the catalog boundary without the refresh controller. Source-controlled defaults, provider visibility, and the `manageModels` gate remain. Session model/variant choices use compact localStorage persistence scoped by server, directory, session, and agent; no provider contexts or routed selection handoff. |
| Composer and drafts | `composer/persistence-singleton.ts`, reduced `composer/commands.tsx`, `composer/history/{entry,store}.ts` | One editor across session changes and one localStorage draft with data-URL attachments. Prompt recall follows the main app's history boundary, with at most 100 accepted prompts and a compact inline-storage budget; no shell or review-comment history. Recent-model and thinking-effort shortcuts apply only while the editor is focused; no command provider, slash commands, context, shell mode, routed/per-tab state, submission retargeting, or retry admission IDs. |
| Session composer and queue | Reduced implementations in `session/composer/` and `composer/editor/editor.tsx` | Persisted follow-up behavior selects Queue or Steer for running turns, with the opposite delivery on Cmd/Ctrl+Enter. No queued editing/reordering, routed controller caches, or child-session navigation. The editor accepts optional queue-editing operations; shortcut hints are configured locally without a command provider. Queue copy uses English source strings with locale fallback. |
| Settings | `settings/{model.tsx,row.tsx,settings.css}`, `settings/general/general.tsx`, `runtime/persistence/settings-storage-compact.ts` | The settings model owns follow-up behavior and reasoning visibility, preserving their existing localStorage keys and header controls. The web-search setting uses the main app's presentational row boundary with embedded styles. No routed settings surface or general command/keybind preferences; reasoning remains a hidden/compact toggle. |
| Session requests | `session/requests/{permission,form}-sync-compact.ts`, `session/requests/session-websearch-dock.{tsx,css}` | Single-session form loading and replies. The web-search dock composes the local `settings/row.tsx` with shared dock surfaces and waits for compact SSE; its styles remain scoped for embedding. |
| Session shell and timeline | `session/header/{recorder-control,session-header-actions}.tsx`, `session/revert.ts`, `session/screen-layout-compact.ts`, `session/timeline/{model,message-timeline}-compact.*`, `shell/errors/{banner-compact.tsx,readable.ts}` | One pane with `HISTORY_DIALOG_LIMIT = 9` and the `current/9` counter; no visible history paging, virtualization, popovers, terminal, or review/file panels. The recorder controls process-wide recording and submits stopped MP3 recordings for transcription. Revert follows the main app's `to`/`undo`/`redo` boundary with compact header controls instead of command-provider entries. It operates on loaded history only while idle, with no pending follow-ups or blocking requests. The screen reads reasoning visibility from the settings model. The error wrapper supplies locale and fallback text. |
| Recent and new sessions | `home/sessions/{index.ts,controller.tsx,search.ts,view.tsx,region.tsx}` with compact directory loading, presentation, and switching helpers; `new-session/controller-compact.ts`, `session/{directory.ts,recovery-compact.ts}`, `constants/session.ts` | The header switcher follows Home's controller/search/view/region boundaries, with title/ID filtering, keyboard selection, and Today/Yesterday/Older groups. Server-side title search and exact session-ID lookup cover the active directory's full history. Browsing and search results use cursor pagination in batches of 12; no home route, workspace selection, or background open. |
| Agent defaults and welcome | `new-session/agent-default-config.*`, `session/agent-welcome-compact.tsx` | 7777-specific fallback agent, welcome markdown, and suggested questions, with desktop-tab overrides. |

## Recent Sessions

Open **Recent sessions** in the header to browse other sessions in the active directory, grouped by local calendar
day and sorted by most recent activity. The list starts with 12 sessions; **Load more** fetches the next batch of 12
until the history is exhausted. Type a title to search the full server history in this directory, or paste a full
session ID to find it directly. Search results also support **Load more** and are not limited to sessions already
loaded. **Arrow Up** and **Arrow Down** select a result, **Enter** opens it, and **Escape** closes the popover.
Clearing the search or reopening the popover starts again with the first batch.

## Undo and Redo

Use **Undo** in the header to rewind the latest user turn and restore its prompt and attachments to the composer.
Use **Redo** to restore one undone turn; redoing the final turn clears the revert boundary and composer. The existing
**Revert message** action uses the same controller, so a message-level revert can also be stepped forward with Redo.

These actions operate on the loaded history and are available when the session is idle, messages have finished
loading, and no follow-ups or requests are pending. Send or remove pending follow-ups before rewinding. The visible
history remains bounded to nine dialogs. Failed requests preserve the current draft and boundary; responses from a
previous session activation cannot overwrite the current session or its draft.

## Composer History and Follow-ups

With the message editor focused and its text empty, press **Arrow Up** to recall the latest accepted prompt.
At the start or end of a recalled prompt, **Arrow Up** and **Arrow Down** move through history; moving past the newest
entry restores the draft you had before recall, including attachments. Text selections, Shift+Arrow keys, and IME
composition keep their normal editing behavior.

History is shared across sessions in this browser and survives reloads. Only prompts accepted by the server are
recorded. The latest 100 entries share a one-million-character JSON budget (about 2 MB of localStorage); entries that
do not fit, including oversized inline attachments, are skipped. If storage is unavailable, history remains usable
in memory. Recalled prompts preserve inline attachments and can be edited without changing the saved entry.

Use the header's **Follow-up behavior** menu to choose **Steer** (the default) or **Queue** while a turn is running.
**Enter** uses that preference and **Cmd+Enter** on macOS, or **Ctrl+Enter** elsewhere, uses the opposite delivery.
When the session is idle, either shortcut sends immediately. The preference is saved in this browser; the composer
also shows the alternate action while a follow-up is ready to send.

## Agent Welcome Content

The fallback local agent, welcome markdown, and suggested questions shown after clicking **New session** live in
`src/new-session/agent-default-config.json`. A desktop tab can override all three values during initialization. Suggested
questions populate the composer when clicked. The welcome markdown is presentation-only and is never included in the
prompt sent to the server. The 7777-only UI for this template feature lives in
`src/session/agent-welcome-compact.tsx`.

## Model Selector Defaults

The source model defaults live in `src/providers/models/default-config.json`.

Models that offer variants show a variant menu beside the model selector. Choices are saved per provider/model in
the browser and pinned to the active session. Returning to a session restores its model and variant, including unsent
choices. Session choices take precedence over per-model preferences, followed by the agent's configured variant when
the selected model matches its configured model. **Default** sends no explicit variant and suppresses those fallbacks.
Server acknowledgements retire submitted choices without discarding newer composer selections. Variant preferences
and session choices are not exported into source defaults by `models:apply-localstorage`.

While the message editor is focused, **F2** cycles through recently selected models and **Shift+F2** cycles in reverse.
Cycling skips hidden or unavailable models and preserves the recent order. Select models from the model menu to add
them to the recent list. **Cmd+Shift+D** on macOS, or **Ctrl+Shift+D** elsewhere, cycles thinking effort through the
model's available variants and back to **Default**. These shortcuts preserve the draft and use the same session-scoped
choices as the selectors.

- `manageModels`: set `true` to show the Manage models entry in the model selector UI. Set `false` to hide it from users.
- `defaultSelection`: the model selected for users who do not already have `opencode.7777.model.selection` in localStorage. Use `{ "providerID": "...", "modelID": "..." }`, or `null` to use the server default.
- `disabledProviders`: provider IDs hidden by default. New models from these providers stay hidden.
- `popularProviders`: provider-level visibility for providers shown first in the model manager.
- `user`: per-model visibility overrides.

To enable the Manage models UI for a developer build:

```json
{
  "manageModels": true
}
```

To configure the default selected model in source:

```json
{
  "defaultSelection": { "providerID": "opencode", "modelID": "gpt-5.1-codex" }
}
```

Use the model's catalog `id` from the server model list for `modelID`; its provider API `modelID` may differ.
Older saved API IDs remain compatible when they identify exactly one model in that provider. If the selection is
missing or ambiguous, the UI falls back to the configured source default, server default, then the first available
model.

## Updating Source Defaults From Browser localStorage

One practical workflow is to enable `manageModels`, run the app, use the Manage models dialog to show or hide models, select the default model in the selector, then dump localStorage from the browser.

In the browser console:

```js
copy(
  JSON.stringify(
    {
      selection: JSON.parse(localStorage.getItem("opencode.7777.model.selection") || "null"),
      config: JSON.parse(localStorage.getItem("opencode.7777.model.config") || "null"),
    },
    null,
    2,
  ),
)
```

Then paste the copied JSON into the package script:

```sh
bun run models:apply-localstorage <<'JSON'
{
  "selection": {
    "providerID": "deepseek",
    "modelID": "deepseek-v4-flash"
  },
  "config": {
    "user": [
      {
        "providerID": "opencode-go",
        "modelID": "glm-5.1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-fable-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-6",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-7",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-8",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-4",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-4-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-4-6",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gemini-3-flash",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "glm-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "glm-5.1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5-nano",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1-codex-max",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1-codex-mini",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.2",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.2-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.3-codex-spark",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.4-pro",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.5-pro",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "kimi-k2.5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "minimax-m2.5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "minimax-m2.7",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "minimax-m3",
        "visibility": "hide"
      },
      {
        "providerID": "google",
        "modelID": "gemini-3.1-flash-image-preview",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "claude-sonnet-5",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "kimi-k2.7-code",
        "visibility": "show"
      },
      {
        "modelID": "deepseek-chat",
        "providerID": "deepseek",
        "visibility": "hide"
      },
      {
        "modelID": "deepseek-reasoner",
        "providerID": "deepseek",
        "visibility": "hide"
      },
      {
        "modelID": "minimax-m2.7",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "qwen3.6-plus",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "zai-glm-4.7",
        "providerID": "cerebras",
        "visibility": "show"
      },
      {
        "modelID": "deepseek-ai/DeepSeek-V4-Pro",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "Pro/moonshotai/Kimi-K2.6",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "Qwen/Qwen3.6-35B-A3B",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "Qwen/Qwen3.5-27B",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "claude-haiku-4-5",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gpt-5.3-codex",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gpt-5.4-nano",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gpt-5.4",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "deepseek-v4-pro",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "mimo-v2.5",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "mimo-v2.5-pro",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "minimax-m3",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "qwen3.7-max",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "deepseek-ai/DeepSeek-V4-Flash",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "claude-sonnet-5",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gemini-3.5-flash",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gpt-5.4-mini",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "qwen3.5-plus",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gemini-3.5-flash-lite",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gemini-3.1-flash-lite-image",
        "providerID": "google",
        "visibility": "show"
      },
      {
        "modelID": "gemini-3-pro-image-preview",
        "providerID": "google",
        "visibility": "show"
      },
      {
        "modelID": "gemini-3.1-pro",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gemini-3.6-flash",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "grok-4.5",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "muse-spark-1.2",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "glm-5.2",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "kimi-k2.6",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "mai-code-1.1-flash",
        "providerID": "github-copilot",
        "visibility": "show"
      },
      {
        "modelID": "gpt-5.6-luna",
        "providerID": "github-copilot",
        "visibility": "show"
      },
      {
        "modelID": "gpt-5.6-luna",
        "providerID": "openai",
        "visibility": "show"
      },
      {
        "modelID": "gpt-oss-120b",
        "providerID": "cerebras",
        "visibility": "show"
      },
      {
        "modelID": "deepseek-v4-pro",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "deepseek-v4-flash",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "muse-spark-1.2-contributor",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "qwen3.7-plus",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "qwen3.8-max",
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "modelID": "claude-opus-5",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "kimi-k2.6",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "muse-spark-1.2-contributor-free",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "gemini-3.8-flash",
        "providerID": "github-copilot",
        "visibility": "show"
      },
      {
        "modelID": "qwen-3.8-27b",
        "providerID": "cerebras",
        "visibility": "show"
      },
      {
        "modelID": "deepseek-v4-flash",
        "providerID": "deepseek",
        "visibility": "hide"
      },
      {
        "modelID": "kimi-for-coding-highspeed",
        "providerID": "kimi-for-coding",
        "visibility": "hide"
      }
    ],
    "disabledProviders": [
      "siliconflow-cn",
      "minimax",
      "cerebras"
    ],
    "popularProviders": [
      {
        "providerID": "github-copilot",
        "visibility": "hide"
      },
      {
        "providerID": "google",
        "visibility": "hide"
      },
      {
        "providerID": "openai",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "visibility": "show"
      },
      {
        "providerID": "openrouter",
        "visibility": "hide"
      }
    ],
    "recent": [
      {
        "providerID": "opencode",
        "modelID": "nemotron-3.5-lightning-free"
      },
      {
        "providerID": "opencode",
        "modelID": "union-alpha"
      },
      {
        "providerID": "opencode-go",
        "modelID": "union-alpha"
      },
      {
        "modelID": "glm-5.3-flash",
        "providerID": "opencode-go"
      },
      {
        "modelID": "deepseek-v4-flash-free",
        "providerID": "opencode"
      }
    ]
  }
}
JSON
```

On macOS, after using `copy(...)` in Chrome, this is shorter:

```sh
pbpaste | bun run models:apply-localstorage
```

The script updates `src/providers/models/default-config.json`. It imports `config.user`, `config.disabledProviders`, `config.popularProviders`, and uses `selection` as `defaultSelection`. It intentionally does not store `recent` in source defaults.

Useful overrides:

```sh
pbpaste | bun run models:apply-localstorage --manage=false
pbpaste | bun run models:apply-localstorage --default=opencode:gpt-5.1-codex
```

After changing model defaults, run:

```sh
bun run typecheck
bun run build
```
