# @opencode-ai/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

This package is the SolidJS/Vite UI for the `7777` agent.

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

This review was refreshed against `packages/app` on 2026-07-14. Shared features follow the main app filenames and
module boundaries where the compact single-session architecture supports them. Keep 7777-only source in place unless
it duplicates an app feature. Known 7777-only source includes `src/context/default-model-config.ts`,
`src/context/default-model-config.json`, `src/context/agent-welcome-config.ts`,
`src/context/agent-welcome-config.json`, `scripts/apply-model-config-dump.ts`, `src/context/session-directory.ts`,
`src/context/session-recovery.ts`, `src/context/question.tsx`, and 7777-specific session constants in
`src/constants/session.ts`.

| Feature/source area                                                  | Current 7777 source                                                                                                                                                                                                                                                                                                                                                                      | Main app source layout                                                                                                                                                                                                                                                                                                                                                                                                  | Parity result and intentional difference                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global/server sync and event reduction                               | `src/context/server-sdk.tsx`, `src/context/sdk.tsx`, `src/context/server-sync.tsx`, `src/context/global-sync/bootstrap.ts`, `src/context/global-sync/event-reducer.ts`, `src/context/global-sync/queue.ts`, `src/context/global-sync/session-load.ts`, `src/context/global-sync/session-cache.ts`, `src/context/permission.tsx`, `src/context/question.tsx`, `src/pages/new-session.tsx` | `src/context/server-sdk.tsx`, `src/context/sdk.tsx`, `src/context/server-sync.tsx`, `src/context/global-sync/bootstrap.ts`, `src/context/global-sync/event-reducer.ts`, `src/context/global-sync/queue.ts`, `src/context/global-sync/session-load.ts`, `src/context/global-sync/session-cache.ts`, `src/pages/new-session.tsx`                                                                                          | 7777 uses the app-matching filenames for server-scoped client creation, bootstrap/session activation, session load/create, queued message refresh, and event reduction. The browser renderer now uses the current `/api` network contract through `@opencode-ai/client`; `@opencode-ai/sdk-next` is the corresponding in-process host and is intentionally not bundled into Vite. 7777 still keeps one active-session SSE lifecycle and cache instead of the app's multi-directory lifecycle.       |
| Session message cache, history normalization, and status text        | `src/context/server-session.ts`, `src/context/global-sync/session-cache.ts`, `src/context/global-sync/event-reducer.ts`, `src/context/global-sync/queue.ts`, `src/pages/session/timeline/model.ts`, `src/components/status-popover.tsx`, `src/components/status-popover-body.tsx`                                                                                                        | `src/context/server-session.ts`, `src/context/global-sync/session-cache.ts`, `src/pages/session/timeline/model.ts`, `src/components/status-popover.tsx`, `src/components/status-popover-body.tsx`                                                                                                                                                                                                                       | 7777 `server-session.ts` owns the global UI store and current session lookup. `global-sync/session-cache.ts` projects current session-message records into the compact existing timeline model, `event-reducer.ts` schedules refreshes for current durable events, `queue.ts` keeps refresh timers, and the header status text stays behind the app-style `status-popover*` filenames. 7777 intentionally tracks one active session and retains its non-virtual legacy-shaped presentation adapter. |
| Provider catalog, model visibility, and model selection              | `src/hooks/use-providers.ts`, `src/hooks/provider-catalog.ts`, `src/context/models.tsx`, `src/context/local.tsx`, `src/pages/session/composer/prompt-model-selection.ts`                                                                                                                                                                                                                 | `src/hooks/use-providers.ts`, `src/hooks/provider-catalog.ts`, `src/context/models.tsx`, `src/context/local.tsx`, `src/context/model-variant.ts`, `src/pages/session/composer/prompt-model-selection.ts`                                                                                                                                                                                                                | Provider loading lives in `use-providers.ts`, connected-provider catalog loading in `provider-catalog.ts`, model options/visibility/recents in `models.tsx`, selected-model persistence in `local.tsx`, and composer selection composition in `prompt-model-selection.ts`. `DEFAULT_MODEL_CONFIG` remains 7777-only. There is no `model-variant.ts` because 7777 does not expose model variant selection.                                                                                           |
| Theme bootstrapping and platform background sync                     | `src/app.tsx`, `vite.config.ts`, `public/oc-theme-preload.js`                                                                                                                                                                                                                                                                                                                            | `src/app.tsx`, `vite.js`, `public/oc-theme-preload.js`                                                                                                                                                                                                                                                                                                                                                                  | 7777 keeps its own copy of the app-style public preload and inlines that local file during HTML transform, then wraps base providers in the shared `ThemeProvider`. It intentionally keeps a different `onThemeApplied` side effect because its shell exposes `setBackgroundColor`, while the app shell exposes `setTitlebar`.                                                                                                                                                                      |
| Prompt state, persistence, submission, and composer orchestration    | `src/context/prompt-state.ts`, `src/context/prompt.tsx`, `src/components/prompt-input/submit.ts`, `src/pages/session/composer/session-composer-state.ts`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-controls.ts`, `src/pages/session/composer/session-permission-dock.tsx`, `src/utils/prompt.ts`                 | `src/context/prompt-state.ts`, `src/context/prompt.tsx`, `src/components/prompt-input/submit.ts`, `src/pages/session/composer/session-composer-state.ts`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-controls.ts`, `src/pages/session/composer/session-permission-dock.tsx`, `src/pages/session/use-composer-commands.tsx`, `src/utils/prompt.ts` | Prompt draft state/persistence, mutations, submission, reconstruction, and composer composition follow matching app files. The permission dock also follows the app boundary and uses the shared `@opencode-ai/session-ui` `DockPrompt`; only its existing 7777 request adapter and labels differ. The compact global store still holds live values, and 7777 omits `use-composer-commands.tsx` because it has no command palette integration.                                                      |
| Recent sessions and session switching                                | `src/pages/home.tsx`, `src/context/directory-sync.ts`, `src/context/tabs.tsx`, `src/context/session-recovery.ts`, `src/pages/new-session.tsx`, `src/components/session/session-header.tsx`, `src/context/server-session.ts`                                                                                                                                                              | `src/pages/home.tsx`, `src/context/directory-sync.ts`, `src/context/tabs.tsx`, `src/components/session/session-header.tsx`                                                                                                                                                                                                                                                                                              | 7777 now keeps recent-session presentation helpers in `home.tsx`, SDK-backed active-directory list loading in `directory-sync.ts`, active-session switching in `tabs.tsx`, and deleted-session fallback in the 7777-only `session-recovery.ts`. It still intentionally uses the compact header dropdown and the package-level `server-session.ts` store instead of the app's broader home page, project grouping, tab router, search, route error boundary, and background opens.                   |
| Timeline projection, rows, and rendering                             | `src/pages/session/timeline/model.ts`, `src/pages/session/timeline/projection.ts`, `src/pages/session/timeline/rows.ts`, `src/pages/session/timeline/timeline-row.ts`, `src/pages/session/timeline/row-reconciliation.ts`, `src/pages/session/timeline/message-timeline.tsx`                                                                                                             | `src/pages/session/timeline/model.ts`, `src/pages/session/timeline/projection.ts`, `src/pages/session/timeline/rows.ts`, `src/pages/session/timeline/timeline-row.ts`, `src/pages/session/timeline/row-reconciliation.ts`, `src/pages/session/timeline/virtual-items.ts`, `src/pages/session/timeline/measure.ts`, `src/pages/session/timeline/message-timeline.tsx`                                                    | Selection/readiness stays in `model.ts`, recursive assistant-parent projection and reconciliation wiring in `projection.ts`, row construction in `rows.ts`, tagged row identity/equality in `timeline-row.ts`, and stable keyed row reuse in `row-reconciliation.ts`. `message-timeline.tsx` follows the app's explicit row-switch pattern with separate user and assistant row components. Virtualization and measurement remain omitted because the compact timeline is not virtualized.          |
| Session page shell, layout, settings, navigation, and header actions | `src/pages/session.tsx`, `src/pages/session/session-layout.ts`, `src/pages/session/new-session-layout.ts`, `src/pages/session/use-session-hash-scroll.ts`, `src/pages/new-session.tsx`, `src/components/session/session-header.tsx`, `src/context/settings.tsx`, `src/context/local.tsx`, `src/constants/session.ts`                                                                     | `src/pages/session.tsx`, `src/pages/session/helpers.ts`, `src/pages/session/session-layout.ts`, `src/pages/session/new-session-layout.ts`, `src/pages/session/use-session-hash-scroll.ts`, `src/components/session/session-header.tsx`, `src/context/settings.tsx`, `src/context/tabs.tsx`, `src/utils/session-route.ts`                                                                                                | Session shell classes, header wiring, empty-state constants, bottom-scroll behavior, and display preferences now live in matching app filenames. `session.tsx` delegates prompt reconstruction to `utils/prompt.ts`. 7777 intentionally keeps one persisted local session and header-driven recent-session switching instead of the app's tab router, panel helpers, and `session-route.ts` layer.                                                                                                  |

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
    "modelID": "deepseek-v4-flash",
    "providerID": "deepseek"
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
        "modelID": "deepseek-v4-flash",
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
        "modelID": "deepseek-v4-flash",
        "providerID": "deepseek"
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
