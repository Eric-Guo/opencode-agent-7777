# @opencode-ai/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

This package is the SolidJS/Vite UI for the `7777` agent.

## Develop

```bash
# read <opencode-state-folder>/service.json
export OPENCODE_SERVER_PASSWORD=here
# get from opencode service status
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

Target root: `<repo-root>/packages/app`, refreshed against commit `50296a3e1a` on 2026-08-31. Story-only sources and
surfaces 7777 does not expose are not parity targets. An unsuffixed filename claims the same responsibility as the
main app even when the compact product supports fewer cases; a narrower responsibility uses a descriptive `-compact`
name. Runtime and package code do not import from or read `../app`, and the package does not depend on
`@opencode-ai/app`. Shared editor sources are package-owned local
copies. 61 source files share a relative path with the main app, 28 byte-for-byte identical. All five public files
with shared relative paths are also byte-for-byte identical; the favicon files remain package-owned assets rather
than links into the main app.

| Feature/source area | Same-responsibility 7777 boundaries | Descriptive or 7777-only boundaries | Remaining intentional difference |
| --- | --- | --- | --- |
| App runtime, language, and platform | `src/app.tsx`, `src/entry.tsx`, `src/runtime/animated-presence.ts`, `src/runtime/i18n/language.tsx`, `src/runtime/i18n/en.ts`, `src/runtime/i18n/zh.ts`, `src/index.css`, `src/env.d.ts`, `public/oc-theme-preload.js`, `public/assets/Inter.ttf` | `src/runtime/platform/desktop-rpc-client.ts`, `src/runtime/platform/platform-bridge.ts`, `src/runtime/server/resolver-compact.ts`, package-local favicon copies | Single embedded mount (`#oc-agent`), en/zh only, one server; no router, server registry, or full platform context. The local bridge owns native attachment picking, source paths, and clipboard images. |
| Server clients, sync, and current-session state | `src/runtime/server/api.ts`, `src/runtime/server/errors.ts`, `src/runtime/server/global-sync/types.ts`, `src/session/session-domain.ts` | `src/runtime/server/client-compact.ts`, `src/runtime/server/directory-client-compact.ts`, `src/runtime/server/sync-session-compact.ts`, `src/runtime/server/session-store-compact.ts`, `src/runtime/server/session-reducer-compact.ts`, and the single-session files under `src/runtime/server/global-sync/` | One direct client, SSE stream, and session instead of the multi-server reactive data layer. |
| Provider catalog and model selection | `src/providers/catalog/order.ts`, `src/providers/models/search.ts`, `src/providers/models/select-dialog.tsx`, `src/providers/models/manage.tsx`, `src/composer/selection.ts` | `src/providers/catalog/client-compact.ts`, `src/providers/catalog/loader-compact.ts`, `src/providers/models/store-compact.ts`, `src/providers/models/default-config.ts`, `src/runtime/persistence/storage-compact.ts` | Imperative catalog load with source-controlled defaults; no provider stores/contexts or model variants. |
| Prompt input and composer | `src/composer/adapter.ts`, `src/composer/composer.tsx`, `src/composer/model.ts`, `src/composer/request.ts`, `src/composer/state.ts`, `src/composer/submit.ts`, `src/composer/attachments/`, `src/composer/editor/`, `src/composer/suggestions/machine.ts`, `src/composer/types.ts`, `src/composer/prompt-parts.ts`, `src/composer/comment-note.ts`, `src/composer/prompt.ts`, `src/runtime/persistence/drafts.ts`, `src/session/composer/adapter.ts`, `src/session/composer/session-composer-region-controller.ts`, `src/session/composer/session-composer-region.tsx` | `src/composer/persistence-singleton.ts` | State, submission, draft persistence, the editor, and the active-session adapter now follow the main-app responsibility boundaries. The implementations remain single-session: commands, context, shell mode, routed/per-tab state, and a prompt queue are disabled; one localStorage draft stores data-URL attachments. |
| Session requests | `src/session/requests/model.ts`, `src/session/requests/session-permission-dock.tsx`, `src/session/requests/session-question-dock.tsx`, `src/session/requests/session-request-tree.ts` | `src/session/requests/permission-sync-compact.ts`, `src/session/requests/question-sync-compact.ts` | The request model has the main-app responsibility boundary, backed by compact single-session sync rather than multi-location data contexts. |
| Session shell and timeline | `src/session/screen.tsx`, `src/session/header/session-header.tsx`, `src/session/revert.ts`, shared `@opencode-ai/session-ui/timeline`, and `src/session/session-domain.ts` | `src/session/header/recorder-control.tsx`, `src/session/screen-layout-compact.ts`, `src/session/timeline/model-compact.ts`, `src/session/timeline/message-timeline-compact.tsx`, `src/session/use-session-hash-scroll-to-end.ts`, `src/shell/errors/banner-compact.tsx` | One compact pane showing the latest nine dialogs; no routing, visible history paging, virtualization, popovers, terminal, or review/file panels. The 7777-only header recorder starts and stops process-wide recordings and refreshes their status; handling the MP3 bytes returned by Stop remains reserved for a future product flow. Revert exposes the timeline's stage-to action without separate undo/redo controls. The reasoning toggle maps to the shared timeline's hidden/compact modes. |
| Recent and new sessions | `src/session/title.ts` and main-app `home/sessions`, `new-session`, and `session/header` feature boundaries | `src/home/sessions/directory-sync-recent-compact.ts`, `src/home/sessions/recent-compact.ts`, `src/home/sessions/switcher-compact.ts`, `src/new-session/controller-compact.ts`, `src/session/recovery-compact.ts` | Compact header only; no home route, grouping, search, workspace selection, or background open. Session-title normalization follows the main app and its shared fallback utility. |
| Shared leaf utilities | `src/runtime/persistence/base64.ts`, `src/runtime/platform/file-picker.ts`, `src/runtime/persistence/uuid.ts`, `src/runtime/server/errors.ts`, `src/shell/commands/search-keydown.ts`, shared `@opencode-ai/schema/session-message` | `src/shell/errors/readable.ts` | Shared leaf boundaries stay local; the shared schema mints explicit message IDs. |

7777-only configuration and recovery sources: `src/providers/models/default-config.*`,
`src/new-session/agent-default-config.*`, `scripts/apply-model-config-dump.ts`, `src/session/directory.ts`,
`src/session/recovery-compact.ts`, the compact request sync under `src/session/requests/`, and
`src/constants/session.ts`.

## Agent Welcome Content

The fallback local agent, welcome markdown, and suggested questions shown after clicking **New session** live in
`src/new-session/agent-default-config.json`. A desktop tab can override all three values during initialization. Suggested
questions populate the composer when clicked. The welcome markdown is presentation-only and is never included in the
prompt sent to the server. The 7777-only UI for this template feature lives in
`src/session/agent-welcome-compact.tsx`.

## Model Selector Defaults

The source model defaults live in `src/providers/models/default-config.json`.

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

The selected model must also be present in the server model list. If it is missing, the UI falls back to the server default and then the first available model.

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
        "providerID": "kimi-for-coding",
        "modelID": "kimi-k2-thinking",
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
        "modelID": "kimi-for-coding-highspeed",
        "providerID": "kimi-for-coding",
        "visibility": "hide"
      },
      {
        "modelID": "deepseek-ai/DeepSeek-V4-Flash",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "zai-org/GLM-5.2",
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
