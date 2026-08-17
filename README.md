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

This review was refreshed against `packages/app` commit `88bd8a39cc563c3f2ea95a21320a52aa092def9c` on
2026-08-17. The main app's `newLayoutDesigns` setting is fixed to `true`, and its legacy page layout has
been removed. This review therefore treats the V2 runtime as the only parity target; unreachable compatibility
branches, legacy component helpers retained by active V2 components, and story-only sources are not separate product
targets. An unsuffixed main-app filename is treated as a claim that the responsibility matches, not merely that the
feature is related. When 7777 implements a narrower or different responsibility, it keeps the main filename stem and
adds a descriptive dash suffix. For example, `server-sdk-client.ts` is the direct-client variant of the main app's
`server-sdk.tsx`, and `new-session-controller.ts` is not presented as the main app's `new-session.tsx` page.

The refresh found 54 7777 source-tree paths with a same-relative-path counterpart in the main app, and 24 of those
files are byte-for-byte identical. The previous refresh counted 55 counterparts and the same 24 exact files. The
lower counterpart count is an intentional layout improvement: the compact-only Basic-auth helper moved into
`src/context/server-sdk-client.ts`, where the direct-client responsibility already lives, and the misleading
`src/utils/server.ts` counterpart was removed. The compact timeline also follows the current main-app notice styling.
The main app's new fixed 200-message paging, virtualizer cleanup, full-session header behavior, and tree directory
picker remain outside the bounded compact UI rather than being copied as unused infrastructure. Within the reviewed
areas, no known file retains an unsuffixed main-app basename for a clearly different responsibility. The remaining
gaps below are product-scope differences rather than unresolved file moves.

| Feature/source area                             | Same-responsibility 7777 boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Descriptive or 7777-only boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Remaining intentional difference                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App root, language, and theme                   | `src/app.tsx`, `src/entry.tsx`, `src/context/language.tsx`, `src/i18n/en.ts`, `src/i18n/zh.ts`, `src/index.css`, `src/env.d.ts`, `vite.config.ts`, `public/oc-theme-preload.js`                                                                                                                                                                                                                                                                                                                                                                                   | `src/context/platform-bridge.ts`, `src/context/server-resolver.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 7777 mounts under `#oc-agent`, resolves one server, and calls the embedding shell's background API. Its language bridge implements the shared UI translation and pluralization contract, but it does not reproduce the main app router, server registry, query provider, full platform context, or complete locale catalog.                                                                                                                                      |
| Server clients, sync, and current-session state | `src/types.ts`, `src/context/global-sync/types.ts`, `src/context/server-session-v2-reducer.ts`, `src/pages/session/session-domain.ts`, `src/utils/session-message.ts`                                                                                                                                                                                                                                                                                                                                                                                             | `src/context/server-sdk-client.ts`, `src/context/sdk-directory-client.ts`, `src/context/server-sync-session.ts`, `src/context/server-session-store.ts`, `src/context/global-sync/bootstrap-session.ts`, `src/context/global-sync/event-reducer-session.ts`, `src/context/global-sync/queue-message-refresh.ts`, `src/context/global-sync/session-load-current.ts`, `src/context/global-sync/session-cache-messages.ts`, `src/context/global-sync/session-cache-projection.ts`, `src/context/permission-sync.ts`, `src/context/question.ts` | The current-message adapter and session-domain helpers are shared exactly, and 7777 retains the raw V2 message list needed by the shared projection. The main app owns reactive providers, multiple servers/directories, cache eviction, and richer event stores. 7777 owns one server and directory, one SSE stream and active session, plus compact directory-wide pending permission/form maps.                                                               |
| Provider catalog and model selection            | `src/components/dialog-select-model-search.ts`, `src/components/dialog-select-model.tsx`, `src/components/dialog-manage-models.tsx`, `src/pages/session/composer/prompt-model-selection.ts`                                                                                                                                                                                                                                                                                                                                                                       | `src/hooks/provider-catalog-client.ts`, `src/hooks/use-providers-loader.ts`, `src/context/models-store.ts`, `src/context/local-storage.ts`, `src/context/default-model-config.ts`                                                                                                                                                                                                                                                                                                                                                          | 7777 normalizes and loads the current catalog imperatively and keeps source-controlled visibility defaults. It does not expose the main app's normalized global/directory provider stores, provider/model contexts, or model-variant selection.                                                                                                                                                                                                                  |
| Prompt input and composer                       | `src/context/prompt-state.ts`, `src/context/prompt.ts`, `src/components/prompt-input-v2.tsx`, `src/components/prompt-input/submit.ts`, `src/pages/session/composer/index.ts`, `src/pages/session/composer/session-composer-state.ts`, `src/pages/session/composer/session-composer-region-controller.ts`, `src/pages/session/composer/session-composer-region.tsx`, `src/pages/session/composer/session-permission-dock.tsx`, `src/pages/session/composer/session-question-dock.tsx`, `src/pages/session/composer/session-request-tree.ts`, `src/utils/prompt.ts` | `src/utils/draft-store-local.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 7777 uses the shared PromptInputV2 controller and blob-reference contract with commands, context, and shell mode disabled, plus one module-level prompt instance and a localStorage-compatible data-URL draft. It uses form-backed questions and the shared child-session request selection boundary, but omits routed/per-tab prompt state, comments, history, menus, prompt-local variants, and provider-backed mutation state.                                |
| Recent sessions and new-session action          | `src/components/session/index.ts`, `src/components/session/session-header.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/context/directory-sync-recent-sessions.ts`, `src/context/tabs-session-switcher.ts`, `src/pages/home-recent-sessions.ts`, `src/pages/new-session-controller.ts`, `src/context/session-recovery.ts`                                                                                                                                                                                                                                                                                                                                     | History and session creation live in the compact header. There is no home route, draft route, project grouping, tab router, search, workspace selection, or background open.                                                                                                                                                                                                                                                                                     |
| Timeline projection and rendering               | `src/pages/session/timeline/model.ts`, `src/pages/session/timeline/projection.ts`, `src/pages/session/timeline/rows.ts`, `src/pages/session/timeline/timeline-row.ts`, `src/pages/session/timeline/row-reconciliation.ts`, `src/pages/session/timeline/message-timeline.tsx`, `src/pages/session/timeline/summary-diffs.ts`                                                                                                                                                                                                                                       | `src/pages/session/use-session-hash-scroll-to-end.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Protocol notices, grouped assistant-part construction, deterministic projection ordering, reconciliation, context-tool grouping, copy targeting, and latest-error selection follow the main app. The main app moved timeline I/O into session/timeline controllers; 7777 keeps compact projection assembly and cursor hydration in its model/cache. It still omits user-driven paging, virtualization, measurement, comment cards, and the full summary-diff UI. |
| Session shell, status, and display settings     | `src/pages/session.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/pages/session/session-layout-compact.ts`, `src/pages/error-banner.tsx`, `src/context/settings-storage.ts`                                                                                                                                                                                                                                                                                                                                                                                                                             | 7777 renders a compact single-pane shell and header status text. It does not expose the main app's panel layout, routed error page, status popover, terminal, review/file panels, or layout settings context.                                                                                                                                                                                                                                                    |
| Shared leaf utilities                           | `src/constants/file-picker.ts`, `src/utils/comment-note.ts`, `src/utils/id.ts`, `src/utils/search-keydown.ts`, `src/utils/server-errors.ts`, `src/utils/uuid.ts`                                                                                                                                                                                                                                                                                                                                                                                                  | `src/utils/readable-error.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | File-picker, search-keydown, server-error, and UUID sources are identical. Comment-note parsing has the same responsibility with a local selection type, while the translated readable-error wrapper remains a compact-app boundary.                                                                                                                                                                                                                             |

The concrete responsibility splits are:

- Native session, provider, request, status, message-protocol, and event types now come directly from
  `@opencode-ai/client/promise`. `src/types.ts` retains only the legacy rendering records consumed by the shared
  session timeline, matching the V2-only main app's separation of native protocol types from rendering adapters.
- `src/pages/session/session-domain.ts` now byte-for-byte matches the main app. The compact timeline consumes its
  user-message and revert-boundary selectors; its file-tab normalization helpers remain unused because 7777 has no
  file-tab router.
- `src/utils/session-message.ts` now byte-for-byte matches the main app's
  current-message-to-legacy-render-record normalization boundary, including agent/model switches, shell turns,
  compaction markers, mentions, tool metadata, streaming input decoding, file-only user turns, and chronological
  comparison for optimistic messages.
  `src/context/global-sync/session-cache-projection.ts` only adapts those records to the compact history store, while
  `src/context/global-sync/session-cache-messages.ts` owns live cache refresh and mutation.
- `src/utils/server-errors.ts` and its colocated test now match the V2-only main app. The 7777-only
  `src/utils/readable-error.ts` supplies the compact language context and request-failed fallback at call sites.
- `src/context/server-sdk-client.ts` owns direct client creation and its Basic-auth header. 7777 no longer keeps a
  compact-only `src/utils/server.ts` under the main app's general server-API utility name.
- `src/pages/session/timeline/timeline-row.ts`, `rows.ts`, `projection.ts`, `row-reconciliation.ts`, and
  `summary-diffs.ts` match the main app. The compact message cache retains ordered raw V2 messages so the shared
  projection can preserve protocol notices, shell turns, chronologically placed optimistic turns, stable context-group
  identity, interruption boundaries, recovered streaming turns, and grouped assistant parts.
- `src/pages/session/timeline/message-timeline.tsx` resolves those shared part groups through the same
  `ContextToolGroup` and `Part` renderers, including the main app's last-text copy action, protocol notices, and
  per-part spacing. Protocol notices use the current weak-text treatment. Tools are always rendered as V2 timeline
  parts; the removed 7777-only tool visibility toggle is no longer a product gap.
- `src/components/prompt-input-v2.tsx` directly wraps the shared PromptInputV2 implementation; the deleted local
  textarea, attachment, and composer-controls boundaries are no longer listed as parity claims.
- `src/context/prompt-state.ts` owns the compact reactive draft and persistence, while `src/context/prompt.ts`
  exposes the single-session composer instance; prompt fields no longer live in the server-session store. The shared
  prompt now receives blob references, while `src/utils/draft-store-local.ts` keeps their data URLs reload-safe in the
  compact localStorage draft.
- `src/context/global-sync/types.ts` owns the compact sync state and timeline history types.
- `src/hooks/provider-catalog-client.ts` follows the current provider `activation` contract while keeping its
  direct-response normalization boundary separate from the main app's global/directory catalog selector.
- Prompt submission follows the main app's inbox projection boundary: `src/components/prompt-input/submit.ts` passes
  a stable client message ID from `src/utils/id.ts` (byte-for-byte identical to the main app) to `session.prompt` and
  echoes the user message locally, while `src/context/global-sync/session-cache-messages.ts` merges
  `session.inbox.list` results into the live cache so admitted-but-undelivered submissions stream into the timeline
  and survive `message.list` refreshes. Session events — inbox lifecycle, text/reasoning deltas, tool calls, and
  compactions — stream through the shared `src/context/server-session-v2-reducer.ts` (byte-for-byte identical to the
  main app, test included); while the session is busy, refreshes preserve in-flight assistant turns, compactions,
  and shells that `message.list` cannot return yet. The deleted
  `src/components/prompt-input/build-request-parts.ts` optimistic-message builder is no longer listed as a parity
  claim. 7777 does not expose inbox cancel/steer/queue actions.
- `src/pages/session/composer/session-request-tree.ts` now matches the main app's metadata-based form and permission
  selection across the active session's known child tree. The question dock filters the supported field types and
  submits protocol option values keyed by field, so the removed main-app `src/utils/question-form.ts` boundary is no
  longer duplicated locally. `src/pages/session/composer/session-permission-dock.tsx` matches the main app
  byte-for-byte again after the portable-shell permission-scanner revert removed its save-patterns guard.
  Directory-wide request loading remains imperative in `src/context/question.ts` and `src/context/permission-sync.ts`.
- Empty-session shell classes live in `src/pages/session/session-layout-compact.ts`; 7777 has no misleading
  `src/pages/session/new-session-layout.ts` because it has no new-session page layout.
- The message cache uses a 36-message page and follows opaque server cursors until it has enough dialog roots to
  hydrate the intentional latest-nine timeline window or reaches the end of history. It does not copy the main app's
  fixed 200-message pages because it does not expose user-driven paging.
- User history and revert selection moved out of the compact timeline model and into the main app's
  `src/pages/session/session-domain.ts` boundary. The compact model intentionally retains latest-nine selection and
  projection assembly because it has no routed session/timeline controllers.
- Header status selection lives with the compact session layout; 7777 does not retain popover-named helper modules
  when it renders no status popover.
- Main-app tests for the identical model-search, UUID, grouped-row projection, current-row construction, and
  summary-diff utilities are colocated under the same relative paths in 7777.

Known 7777-only configuration and recovery source remains in `src/context/default-model-config.ts`,
`src/context/default-model-config.json`, `src/context/agent-default-config.ts`,
`src/context/agent-default-config.json`, `scripts/apply-model-config-dump.ts`, `src/context/session-directory.ts`,
`src/context/session-recovery.ts`, the compact form sync in `src/context/question.ts`, and 7777-specific session constants in
`src/constants/session.ts`.

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
