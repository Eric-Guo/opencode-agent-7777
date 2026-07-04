# @opencode-ai/7777

This package is the SolidJS/Vite UI for the `7777` agent.

## Open Source Notes

This package should not depend on a contributor's local home directory or private company resources. Use
`<repo-root>` in documentation when referring to the monorepo checkout, and keep private agent prompts, internal
network paths, credentials, and localStorage dumps out of commits.

The production/private 7777 agent prompt is not included verbatim. A sanitized reference template lives at
`docs/reference/7777-agent.md`; copy and adapt it for a local OpenCode agent configuration if needed.

## Code Layout Parity Review

Target root: `<repo-root>/packages/app`. Target paths below are relative to that root.

This section tracks code that exists in `packages/7777` but is currently bundled into a different file or a broader
module than the main app layout. Keep 7777-only source in place unless it duplicates an app feature. Known 7777-only
source includes `src/context/default-model-config.ts`, `src/context/default-model-config.json`,
`scripts/apply-model-config-dump.ts`, `src/context/session-directory.ts`, and 7777-specific session constants in
`src/constants/session.ts`.

Review update: new-session creation now lives in `src/pages/new-session.tsx`, matching the main app's feature filename.
The session page also delegates timeline auto-scroll to `src/pages/session/helpers.ts` instead of keeping that helper
logic inline. Theme preload source now lives at `public/oc-theme-preload.js`, and the window background sync side effect
is owned by the app root in `src/app.tsx`. Existing desktop API calls now route through `src/context/platform.tsx`.

| Feature/source area | Current 7777 source | Main app source layout | Mismatch found |
| --- | --- | --- | --- |
| App shell, render bootstrap, and base providers | `src/entry.tsx`, `src/app.tsx` | `src/entry.tsx`, `src/app.tsx` (`AppBaseProviders`, `AppInterface`, `ConnectionGate`) | 7777 renders one `App` directly and keeps only language/dialog providers there. The app splits platform/server bootstrap in `entry.tsx` from base providers, connection gate, and routed app interface in `app.tsx`. |
| Server connection and SDK scope | `src/context/server.tsx`, `src/context/sdk.tsx`, `src/utils/server.ts`, `src/context/server-sync.tsx` | `src/context/server.tsx`, `src/context/server-sdk.tsx`, `src/context/sdk.tsx`, `src/utils/server.ts` | 7777 keeps a single `ServerInfo` and builds SDK clients directly. The app separates server catalog/selection, server-scoped SDK, and directory-scoped SDK. |
| Global/server sync and event reduction | `src/context/server-sync.tsx`, `src/context/server-session.ts`, `src/context/permission.tsx`, `src/pages/new-session.tsx` | `src/context/server-sync.tsx`, `src/context/global-sync/bootstrap.ts`, `src/context/global-sync/event-reducer.ts`, `src/context/global-sync/queue.ts`, `src/context/global-sync/session-load.ts`, `src/context/global-sync/session-cache.ts`, `src/pages/new-session.tsx` | 7777 still combines startup, default session creation, SSE subscription, message refresh, model refresh, permission refresh, and event handling in the sync/session files. New-session creation has been moved to the app-matching page feature file, while bootstrap, event reducers, queues, session loading, and cache behavior remain broader than the app's `global-sync/*` layout. |
| Session message cache, history normalization, and status text | `src/context/server-session.ts` | `src/context/server-session.ts`, `src/pages/session/timeline/model.ts`, `src/components/status-popover.tsx`, `src/components/status-popover-body.tsx` | 7777 `server-session.ts` owns the global UI store, message sorting/merge, optimistic message helpers, refresh timer, current session lookup, and `statusText`. In the app, session cache/state, timeline model, and visible status presentation are separate features. |
| Provider catalog, model visibility, and model selection | `src/context/models.tsx`, `src/hooks/use-providers.ts`, `src/context/local.tsx` | `src/hooks/use-providers.ts`, `src/hooks/provider-catalog.ts`, `src/context/models.tsx`, `src/context/local.tsx`, `src/context/model-variant.ts` | 7777 fetches providers, builds model options, persists visibility, resolves defaults, and stores selected model in one model/local path. The app splits provider catalog selection, model visibility/recents, per-session local model selection, and variants. `DEFAULT_MODEL_CONFIG` remains 7777-only. |
| Prompt state and composer orchestration | `src/context/server-session.ts`, `src/context/prompt.tsx`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-controls.ts` | `src/context/prompt.tsx`, `src/pages/session/composer/session-composer-state.ts`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-controls.ts`, `src/pages/session/use-composer-commands.tsx` | 7777 stores prompt text and attachments in the global session store, while `session-composer-region-controller.ts` aggregates prompt state, model state, permissions, and submit/abort wiring. The app keeps prompt sessions and composer request/dock state in dedicated files. |
| Prompt input UI state and editor helpers | `src/components/prompt-input.tsx`, `src/components/prompt-input/transient-state.ts` | `src/components/prompt-input.tsx`, `src/components/prompt-input/editor-dom.ts`, `src/components/prompt-input/history.ts`, `src/components/prompt-input/placeholder.ts`, `src/components/prompt-input/slash-popover.tsx`, `src/components/prompt-input/context-items.tsx`, `src/components/prompt-input/drag-overlay.tsx`, `src/components/prompt-input/submission-state.ts`, `src/components/prompt-input/transient-state.ts` | 7777 uses a compact textarea input and an unused minimal transient state helper. If prompt history, cursor handling, slash/at popovers, context pills, drag overlay, or submission state are added, place them in the same app filenames instead of growing `prompt-input.tsx`. |
| Permission request handling and permission dock data | `src/context/permission.tsx`, `src/pages/session/composer/session-permission-dock.tsx` | `src/context/permission.tsx`, `src/context/permission-auto-respond.ts`, `src/pages/session/composer/session-request-tree.ts`, `src/pages/session/composer/session-permission-dock.tsx`, `src/context/notification.tsx` | 7777 combines permission event shape normalization, fetch/reply calls, notification display, request view shaping, and dock state in `context/permission.tsx`. The app separates persistent permission behavior, auto-respond logic, request tree selection, dock UI, and notification plumbing. |
| Timeline projection, rows, rendering, and measurement | `src/pages/session/timeline/message-timeline.tsx`, `src/pages/session/timeline/model.ts` | `src/pages/session/timeline/model.ts`, `src/pages/session/timeline/projection.ts`, `src/pages/session/timeline/rows.ts`, `src/pages/session/timeline/timeline-row.ts`, `src/pages/session/timeline/row-reconciliation.ts`, `src/pages/session/timeline/virtual-items.ts`, `src/pages/session/timeline/measure.ts`, `src/pages/session/timeline/message-timeline.tsx` | 7777 keeps message filtering, dialog limiting, markdown rendering, reasoning summaries, file/tool rendering, copy behavior, and row display in two files. The app splits timeline data selection, projection, row typing, reconciliation, virtualization, measurement, and rendered timeline UI. |
| Session page shell, layout, navigation, and header actions | `src/pages/session.tsx`, `src/pages/session/helpers.ts`, `src/pages/new-session.tsx`, `src/components/session/session-header.tsx`, `src/context/local.tsx`, `src/constants/session.ts` | `src/pages/session.tsx`, `src/pages/session/helpers.ts`, `src/pages/session/session-layout.ts`, `src/pages/session/new-session-layout.ts`, `src/pages/session/use-session-hash-scroll.ts`, `src/components/session/session-header.tsx`, `src/context/tabs.tsx`, `src/utils/session-route.ts` | 7777 now keeps new-session creation and timeline auto-scroll outside `session.tsx`, matching the closest app filenames for those features. It still combines session initialization, loading/empty states, persisted session ID, and header controls in the session page/header path, while the app separates route/session layout, tab/session routing, hash scroll, and header behavior. |
| Server error formatting | `src/utils/server-errors.ts` | `src/utils/server-errors.ts`, `src/utils/server-errors.test.ts` | 7777 exposes a small `readableError` helper. The app source handles named server errors, config/model diagnostics, session-not-found helpers, and tests in the same utility area. |

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
        "providerID": "kimi-for-coding",
        "modelID": "k2p7",
        "visibility": "show"
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
