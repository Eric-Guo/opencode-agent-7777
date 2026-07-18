# @opencode-ai/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

This package is the SolidJS/Vite UI for the `7777` agent.

## Develop

```bash
export OPENCODE_SERVER_PASSWORD=here
export VITE_OPENCODE_SERVER_PORT=4096
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
application must also serve the shared assets from `<repo-root>/packages/app/public` at its public root.
The package-owned rules in `src/index.css` are scoped below `#oc-agent`; the shared Tailwind and OpenCode UI styles
remain global. Configure the target application's `/api` route or development proxy to reach the OpenCode server,
matching the proxy setup in `vite.config.ts`.

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

Target root: `<repo-root>/packages/app`. Target paths below are relative to that root.

This review was refreshed against `packages/app` on 2026-07-16. An unsuffixed main-app filename is now treated as a
claim that the responsibility matches, not merely that the feature is related. When 7777 implements a narrower or
different responsibility, it keeps the main filename stem and adds a descriptive dash suffix. For example,
`server-sdk-client.ts` is the direct-client variant of the main app's `server-sdk.tsx`, and
`new-session-controller.ts` is not presented as the main app's `new-session.tsx` page.

Within the reviewed areas, no known file retains an unsuffixed main-app basename for a clearly different
responsibility. The remaining gaps below are product-scope differences rather than unresolved file moves.

| Feature/source area                             | Same-responsibility 7777 boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Descriptive or 7777-only boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Remaining intentional difference                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App root, language, and theme                   | `src/app.tsx`, `src/entry.tsx`, `src/context/language.tsx`, `vite.config.ts`, `public/oc-theme-preload.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `src/context/platform-bridge.ts`, `src/context/server-resolver.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 7777 mounts under `#oc-agent`, resolves one server, and calls the embedding shell's background API. It does not reproduce the main app router, server registry, query provider, or full platform context.     |
| Server clients, sync, and current-session state | `src/context/global-sync/types.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `src/context/server-sdk-client.ts`, `src/context/sdk-directory-client.ts`, `src/context/server-sync-session.ts`, `src/context/server-session-store.ts`, `src/context/global-sync/bootstrap-session.ts`, `src/context/global-sync/event-reducer-session.ts`, `src/context/global-sync/queue-message-refresh.ts`, `src/context/global-sync/session-load-current.ts`, `src/context/global-sync/session-cache-messages.ts`, `src/context/global-sync/session-cache-projection.ts`, `src/context/permission-sync.ts`, `src/context/question.ts` | The main app owns reactive providers, multiple servers/directories, cache eviction, and richer event stores. 7777 owns one server, directory, SSE stream, active session, and compact UI store.               |
| Provider catalog and model selection            | `src/hooks/provider-catalog.ts`, `src/components/dialog-select-model-search.ts`, `src/components/dialog-select-model.tsx`, `src/components/dialog-manage-models.tsx`, `src/pages/session/composer/prompt-model-selection.ts`                                                                                                                                                                                                                                                                                                                                                                                                   | `src/hooks/use-providers-loader.ts`, `src/context/models-store.ts`, `src/context/local-storage.ts`, `src/context/default-model-config.ts`                                                                                                                                                                                                                                                                                                                                                                                                  | 7777 loads the v2 catalog imperatively and keeps source-controlled visibility defaults. It does not expose the main app's provider/model contexts or model-variant selection.                                 |
| Prompt input and composer                       | `src/components/prompt-input.tsx`, `src/components/prompt-input/attachments.ts`, `src/components/prompt-input/build-request-parts.ts`, `src/components/prompt-input/submit.ts`, `src/pages/session/composer/session-composer-state.ts`, `src/pages/session/composer/session-composer-controls.ts`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-region.tsx`, `src/pages/session/composer/session-permission-dock.tsx`, `src/pages/session/composer/session-question-dock.tsx`, `src/pages/session/composer/session-request-tree.ts`, `src/utils/prompt.ts` | `src/context/prompt-state-storage.ts`, `src/context/prompt-actions.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 7777 uses a textarea plus attachments and persisted draft, without the main app's structured editor, command palette, slash menu, comments, history, or shell mode.                                           |
| Recent sessions and new-session action          | `src/components/session/session-header.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/context/directory-sync-recent-sessions.ts`, `src/context/tabs-session-switcher.ts`, `src/pages/home-recent-sessions.ts`, `src/pages/new-session-controller.ts`, `src/context/session-recovery.ts`                                                                                                                                                                                                                                                                                                                                     | History and session creation live in the compact header. There is no home route, draft route, project grouping, tab router, search, or background open.                                                       |
| Timeline projection and rendering               | `src/pages/session/timeline/model.ts`, `src/pages/session/timeline/projection.ts`, `src/pages/session/timeline/rows.ts`, `src/pages/session/timeline/timeline-row.ts`, `src/pages/session/timeline/row-reconciliation.ts`, `src/pages/session/timeline/message-timeline.tsx`                                                                                                                                                                                                                                                                                                                                                   | `src/pages/session/use-session-hash-scroll-to-end.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The shared row/projection responsibilities match. 7777 intentionally omits routed message hashes, paged history, virtualization, and measurement.                                                             |
| Session shell, status, and display settings     | `src/pages/session.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/pages/session/session-layout-compact.ts`, `src/pages/error-banner.tsx`, `src/components/status-popover-text.ts`, `src/components/status-popover-body-text.ts`, `src/context/settings-storage.ts`                                                                                                                                                                                                                                                                                                                                      | 7777 renders a compact single-pane shell and header status text. It does not expose the main app's panel layout, routed error page, status popover, terminal, review/file panels, or layout settings context. |

This refresh also made three responsibility splits rather than only renaming files:

- `src/context/global-sync/types.ts` now owns the compact sync state and timeline history types.
- `src/context/global-sync/session-cache-projection.ts` owns the pure v2 message-to-timeline adapter, while
  `src/context/global-sync/session-cache-messages.ts` owns live cache refresh and mutation.
- Empty-session shell classes moved into `src/pages/session/session-layout-compact.ts`; the misleading
  `src/pages/session/new-session-layout.ts` file was removed because 7777 has no new-session page layout.

Known 7777-only configuration and recovery source remains in `src/context/default-model-config.ts`,
`src/context/default-model-config.json`, `src/context/agent-welcome-config.ts`,
`src/context/agent-welcome-config.json`, `scripts/apply-model-config-dump.ts`, `src/context/session-directory.ts`,
`src/context/session-recovery.ts`, `src/context/question.ts`, and 7777-specific session constants in
`src/constants/session.ts`.

## Agent Welcome Content

The welcome markdown and suggested questions shown after clicking **New session** live in
`src/context/agent-welcome-config.json`. Suggested questions populate the composer when clicked. The welcome markdown
is presentation-only and is never included in the prompt sent to the server. The 7777-only UI for this template
feature lives in `src/pages/session/agent-welcome.tsx`.

## Model Selector Defaults

The source model defaults live in `src/context/default-model-config.json`.

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
    "providerID": "kimi-for-coding",
    "modelID": "k2p7"
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
        "providerID": "kimi-for-coding",
        "modelID": "k2p5",
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
        "providerID": "openai",
        "modelID": "gpt-5.5",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-5.4-mini",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-5.4",
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
        "providerID": "github-copilot",
        "modelID": "mai-code-1-flash-picker",
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
        "modelID": "kimi-k2.6",
        "providerID": "opencode",
        "visibility": "hide"
      },
      {
        "modelID": "kimi-k2.7-code",
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
        "modelID": "k2p7",
        "providerID": "kimi-for-coding"
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

The script updates `src/context/default-model-config.json`. It imports `config.user`, `config.disabledProviders`, `config.popularProviders`, and uses `selection` as `defaultSelection`. It intentionally does not store `recent` in source defaults.

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
