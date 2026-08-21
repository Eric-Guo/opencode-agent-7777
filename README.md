# @opencode-ai/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

This package is the SolidJS/Vite UI for the `7777` agent.

## Develop

```bash
# get from service-dev.json
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
application must also serve the shared assets from `<repo-root>/packages/app/public` at its public root.
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

Target root: `<repo-root>/packages/app`. Target paths below are relative to that root.

This review was refreshed against `packages/app` commit `647e9da249930bc6b20a229346e0028eaac1c028` on
2026-08-20. The main app's legacy layout is gone, so the current V2 runtime is the only parity target. Story-only
sources and infrastructure for product surfaces that 7777 does not expose are not parity targets. An unsuffixed
main-app filename claims the same responsibility; narrower compact boundaries use descriptive suffixes such as
`server-sdk-client.ts`, `new-session-controller.ts`, and `message-timeline-compact.tsx`.

There are now 37 7777 source-tree paths with a same-relative-path main-app counterpart, 11 of which are byte-for-byte
identical. The earlier 54/24 count is not directly comparable: the main app promoted current-message state, ID
generation, and timeline rendering into `@opencode-ai/client`, `@opencode-ai/schema`, and
`@opencode-ai/session-ui`, then deleted the old local copies. This pass follows those current-message and rendering
moves instead of preserving stale counterparts. It removes the duplicate legacy message/part store and adapter, the
generic ID utility, and the local timeline renderer/diff-summary stack. The current-message stream remains the single
timeline source of truth.

| Feature/source area                             | Same-responsibility 7777 boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Descriptive or 7777-only boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Remaining intentional difference                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App root, language, and theme                   | `src/app.tsx`, `src/entry.tsx`, `src/context/language.tsx`, `src/i18n/en.ts`, `src/i18n/zh.ts`, `src/index.css`, `src/env.d.ts`, `vite.config.ts`, `public/oc-theme-preload.js`                                                                                                                                                                                                                                                                                                                                                          | `src/context/desktop-rpc-client.ts`, `src/context/platform-bridge.ts`, `src/context/server-resolver.ts`                                                                                                                                                                                                                                                                                                                                                                                                                          | 7777 mounts below `#oc-agent`, resolves one server, and bridges the embedding shell through a narrow desktop RPC client. It does not reproduce the router, server registry, query provider, full platform context, or full locale catalog.                                                            |
| Server clients, sync, and current-session state | `src/context/global-sync/types.ts`, `src/pages/session/session-domain.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/context/server-sdk-client.ts`, `src/context/sdk-directory-client.ts`, `src/context/server-sync-session.ts`, `src/context/server-session-store.ts`, `src/context/server-session-v2-reducer.ts`, `src/context/global-sync/bootstrap-session.ts`, `src/context/global-sync/event-reducer-session.ts`, `src/context/global-sync/queue-message-refresh.ts`, `src/context/global-sync/session-load-current.ts`, `src/context/global-sync/session-cache-messages.ts`, `src/context/permission-sync.ts`, `src/context/question.ts` | The main app uses the shared reactive data layer for multiple servers and locations. 7777 keeps one direct client, SSE stream, session, ordered current-message list, and compact directory-wide permission/form maps.                                                                                 |
| Provider catalog and model selection            | `src/components/dialog-select-model-search.ts`, `src/components/dialog-select-model.tsx`, `src/components/dialog-manage-models.tsx`, `src/pages/session/composer/prompt-model-selection.ts`                                                                                                                                                                                                                                                                                                                                              | `src/hooks/provider-catalog-client.ts`, `src/hooks/use-providers-loader.ts`, `src/context/models-store.ts`, `src/context/local-storage.ts`, `src/context/default-model-config.ts`                                                                                                                                                                                                                                                                                                                                               | 7777 loads the catalog imperatively and retains source-controlled defaults. It omits global/directory provider stores, provider contexts, and model variants.                                                                                                                                          |
| Prompt input and composer                       | `src/context/prompt-state.ts`, `src/components/prompt-input-v2.tsx`, `src/components/prompt-input/submit.ts`, `src/pages/session/composer/index.ts`, `src/pages/session/composer/session-composer-state.ts`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-region.tsx`, `src/pages/session/composer/session-permission-dock.tsx`, `src/pages/session/composer/session-question-dock.tsx`, `src/pages/session/composer/session-request-tree.ts`, `src/utils/prompt.ts` | `src/context/prompt.ts`, `src/utils/draft-store-local.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 7777 uses the shared `@opencode-ai/app` composer editor with commands, context, shell mode, and routed/per-tab prompt state disabled. Its one draft remains reload-safe in localStorage.                                                                                                               |
| Recent sessions and new-session action          | `src/components/session/index.ts`, `src/components/session/session-header.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/context/directory-sync-recent-sessions.ts`, `src/context/tabs-session-switcher.ts`, `src/pages/home-recent-sessions.ts`, `src/pages/new-session-controller.ts`, `src/context/session-recovery.ts`                                                                                                                                                                                                                                                                                                                          | History and creation live in the compact header; there is no home route, project grouping, search, workspace selection, or background open.                                                                                                                                                            |
| Timeline projection and rendering               | Shared `@opencode-ai/session-ui/timeline` and `src/pages/session/session-domain.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/pages/session/timeline/model-compact.ts`, `src/pages/session/timeline/message-timeline-compact.tsx`, `src/pages/session/use-session-hash-scroll-to-end.ts`                                                                                                                                                                                                                                                                                                                                                                 | Shared code owns row construction, rendering, protocol notices, grouping, reconciliation, copy targets, retries, and errors. The compact model only selects the latest nine dialogs and applies the revert boundary. It omits user-driven paging, virtualization, measurement, and review/diff panels. |
| Session shell, status, and display settings     | `src/pages/session.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `src/pages/session/session-layout-compact.ts`, `src/pages/error-banner.tsx`, `src/context/settings-storage.ts`                                                                                                                                                                                                                                                                                                                                                                                                                  | 7777 renders one compact pane and header status text, without the main app's routed panels, status popover, terminal, review/file panels, or layout settings context.                                                                                                                                  |
| Shared leaf utilities                           | `src/constants/file-picker.ts`, `src/utils/comment-note.ts`, `src/utils/search-keydown.ts`, `src/utils/server-errors.ts`, `src/utils/uuid.ts`, shared `@opencode-ai/schema/session-message`                                                                                                                                                                                                                                                                                                                                              | `src/utils/readable-error.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | File-picker, search-keydown, server-error, and UUID sources are identical. Comment metadata and prompt presentation have the same responsibility with a local file-selection type. The shared schema mints explicit IDs for the direct promise client.                                                 |

The concrete responsibility splits are:

- Native session, provider, request, status, message, and event types come from `@opencode-ai/client`. The store now
  retains only `SessionMessageInfo[]`; `src/types.ts`, `src/utils/session-message.ts`, and
  `src/context/global-sync/session-cache-projection.ts` were removed with the redundant legacy render store.
- `src/pages/session/timeline/message-timeline-compact.tsx` is only the compact width/pointer wrapper around the shared
  `SessionTimeline`. The shared component now owns the row renderer that previously occupied
  `src/pages/session/timeline/message-timeline.tsx`.
- `src/pages/session/timeline/model-compact.ts` owns the intentional latest-nine window, shell-turn counting, readiness,
  and revert filtering. The message cache still follows opaque cursors until that bounded window is hydrated or
  history ends. The old per-turn `DiffSummary` path was removed because current protocol user messages do not carry
  the legacy `summary.diffs` field; 7777 still intentionally has no review/diff panel.
- Prompt submission merges local echoes and admitted inbox messages into the current-message cache. The direct promise
  client requires an explicit ID, now minted by the same `SessionMessage.ID.create()` schema API used by the main app.
  This removes both the generic 93-line `src/utils/id.ts` and its compact message-only replacement. A production
  benchmark showed the shared Effect-backed schema increases the main bundle by about 16 KB gzip; structural parity is
  preferred for this boundary.
- Revert draft restoration reads the current user message directly, including presentation text and uploaded files.
  `src/utils/comment-note.ts` now also reads the main app's prompt-presentation metadata shape.
- `src/pages/session/session-domain.ts`, `src/pages/session/composer/session-request-tree.ts`, and
  `src/utils/server-errors.ts` now match the current main app byte-for-byte. The other exact files are model search and
  its test, file-picker constants, the permission dock, search-keydown, the server-errors test, and UUID plus its test.
- The main app moved event folding into `@opencode-ai/client/solid`; 7777 retains its imperative
  `src/context/server-session-v2-reducer.ts` because it does not instantiate the multi-location reactive data layer.
  Busy refreshes preserve in-flight assistants, compactions, and shells that `message.list` cannot return yet.
- `src/components/prompt-input-v2.tsx` remains a compact wrapper over the shared `@opencode-ai/app` composer editor.
  Prompt draft state lives in `src/context/prompt-state.ts`, while `src/context/prompt.ts` exposes the single active
  instance.
- Empty-session classes remain in `src/pages/session/session-layout-compact.ts`, and header status selection stays with
  that compact layout. 7777 does not keep page-layout or status-popover filenames for surfaces it does not render.

Known 7777-only configuration and recovery source remains in `src/context/default-model-config.ts`,
`src/context/default-model-config.json`, `src/context/agent-default-config.ts`,
`src/context/agent-default-config.json`, `scripts/apply-model-config-dump.ts`, `src/context/session-directory.ts`,
`src/context/session-recovery.ts`, the compact form sync in `src/context/question.ts`, and 7777-specific session
constants in `src/constants/session.ts`.

## Agent Welcome Content

The fallback local agent, welcome markdown, and suggested questions shown after clicking **New session** live in
`src/context/agent-default-config.json`. A desktop tab can override all three values during initialization. Suggested
questions populate the composer when clicked. The welcome markdown is presentation-only and is never included in the
prompt sent to the server. The 7777-only UI for this template feature lives in
`src/pages/session/agent-welcome.tsx`.

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
    "recent": []
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
