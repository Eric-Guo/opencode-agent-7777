# @opencode/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

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

Target root: `<repo-root>/packages/app`, refreshed against commit `4bc7c1750f` on 2026-09-18. Story-only sources and
surfaces 7777 does not expose are not parity targets. An unsuffixed filename claims the same responsibility as the
main app even when the compact product supports fewer cases; a narrower responsibility uses a descriptive `-compact`
name. Runtime and package code do not import from or read `../app`, and the package does not depend on
`@opencode/app`. Editor sources and DOM helpers remain package-owned.
90 source files (including tests) share a relative path with the main app, 19 byte-for-byte identical. All
five public files with shared relative paths are also byte-for-byte identical; the favicon files remain
package-owned assets rather than links into the main app.

| Feature/source area | Same-responsibility 7777 boundaries | Descriptive or 7777-only boundaries | Remaining intentional difference |
| --- | --- | --- | --- |
| App runtime, language, and platform | `src/app.tsx`, `src/entry.tsx`, `src/runtime/animated-presence.ts`, `src/runtime/i18n/language.tsx`, `src/runtime/i18n/en.ts`, `src/runtime/i18n/zh.ts`, `src/index.css`, `src/env.d.ts`, `public/oc-theme-preload.js`, `public/assets/Inter.ttf` | `src/runtime/platform/desktop-rpc-client.ts`, `src/runtime/platform/platform-bridge.ts`, `src/runtime/server/resolver-compact.ts`, package-local favicon copies | Single embedded mount (`#oc-agent`), en/zh only, one server; no router, server registry, or full platform context. The local bridge owns native attachment picking, source paths, and clipboard images. |
| Server clients, sync, and current-session state | `src/runtime/server/api.ts`, `src/runtime/server/errors.ts`, `src/runtime/server/request-queue.ts`, `src/runtime/server/global-sync/types.ts`, `src/runtime/server/global-sync/utils.ts`, `src/runtime/server/types.ts`, `src/session/session-domain.ts` | `src/runtime/server/client-compact.ts`, `src/runtime/server/directory-client-compact.ts`, `src/runtime/server/sync-session-compact.ts`, `src/runtime/server/session-store-compact.ts`, `src/runtime/server/session-reducer-compact.ts`, and the single-session bootstrap, event, message-cache, and queue files under `src/runtime/server/global-sync/` | One server, SSE stream, and session instead of the multi-server reactive data layer. The transport queue follows the main app's four-request budget, slow-request allowance, and response-header deadlines; SSE bypasses the budget. Compact SDKs share a queue by server origin and underlying fetch, while each client keeps its own credentials. |
| Provider catalog and model selection | `src/providers/catalog/order.ts`, `src/providers/models/models.tsx`, `src/providers/models/selection.tsx`, `src/providers/models/search.ts`, `src/providers/models/select-dialog.tsx`, `src/providers/models/manage.tsx`, `src/providers/models/tooltip.tsx`, `src/composer/selection.ts` | `src/providers/catalog/loader-compact.ts`, `src/providers/models/default-config.ts`, `src/runtime/persistence/storage-compact.ts` | Catalog conversion and view types follow `runtime/server/global-sync/utils.ts` and `runtime/server/types.ts`; display names, visibility, and recency belong to `models.tsx`, with active-session selection and fallback in `selection.tsx`. The composer delegates to that selection. Model details use the main-app tooltip boundary, accepting normalized capability maps and omitting reasoning when the API does not report it. Imperative loading and load status stay in the compact catalog loader. Source-controlled defaults, provider visibility, and the `manageModels` gate remain; no provider contexts or model variants. |
| Prompt input and composer | `src/composer/adapter.ts`, `src/composer/composer.tsx`, `src/composer/model.ts`, `src/composer/request.ts`, `src/composer/state.ts`, `src/composer/schema.ts`, `src/composer/submission-state.ts`, `src/composer/submit.ts`, `src/composer/attachments/`, `src/composer/editor/` (including `dom.ts`), `src/composer/suggestions/machine.ts`, `src/composer/types.ts`, `src/composer/prompt-parts.ts`, `src/composer/comment-note.ts`, `src/composer/prompt.ts`, `src/runtime/persistence/drafts.ts`, `src/runtime/persistence/schema.ts` | `src/composer/persistence-singleton.ts` | State, persisted draft schemas, submission capture/clear/restore, draft persistence, and the editor follow the main-app responsibility boundaries. Composer schemas own field recovery; persistence schemas supply the local generic recovery helpers. Failed sends restore untouched drafts with attachments, and old-session completions do not change the active session. The implementations remain single-session: commands, context, shell mode, and routed/per-tab state are disabled; one localStorage draft stores data-URL attachments. Submission retargeting and retry admission IDs remain outside the compact implementation. |
| Session composer integration | `src/session/composer/adapter.ts`, `src/session/composer/controller.ts`, `src/session/composer/region.tsx`, `src/session/composer/queue.ts`, `src/session/composer/queue-panel.tsx`, `src/session/composer/session-composer-region-controller.ts`, `src/session/composer/session-composer-region.tsx` | — | The active region assembles requests, model controls, and timeline revert actions; the controller owns the adapter and editor model. The adapter owns draft identity, busy state, submission, interruption, and attachment errors. The dock controller owns request state and editing availability, and its view receives a composer slot. One editor persists across session changes; blocking requests leave its draft visible but disabled. The session queue follows the main-app module boundaries and default Steer/Queue delivery, with Send/Steer and Remove actions. Queued editing, reordering, follow-up preference settings, routed controller caches, and child-session navigation are not exposed. |
| Session requests | `src/session/requests/model.ts`, `src/session/requests/session-permission-dock.tsx`, `src/session/requests/session-question-dock.tsx`, `src/session/requests/session-request-tree.ts`, `src/session/requests/websearch.ts`, `src/session/requests/session-websearch-dock.tsx`, `src/session/requests/session-websearch-dock.css` | `src/session/requests/permission-sync-compact.ts`, `src/session/requests/form-sync-compact.ts` | The request model and tree cover permissions, questions, and web-search consent/provider forms. Web-search selection follows the main app's two-step form protocol and waits for the compact SSE connection; the dock uses shared UI controls with package-owned markup and scoped styles instead of the full settings context. Form loading and replies stay in compact single-session sync, using `form.list` and `session.form.reply/cancel`; permission replies use the shared client’s `decision` field. |
| Session shell and timeline | `src/session/screen.tsx`, `src/session/header/session-header.tsx`, `src/session/revert.ts`, `src/session/timeline/interaction.ts`, shared `@opencode/session-ui/timeline`, and `src/session/session-domain.ts` | `src/session/screen-layout-compact.ts`, `src/session/timeline/model-compact.ts`, `src/session/timeline/message-timeline-compact.tsx`, `src/runtime/persistence/settings-storage-compact.ts`, `src/shell/errors/banner-compact.tsx` | One compact pane showing the latest nine dialogs; no routing, visible history paging, virtualization, popovers, terminal, or review/file panels. Revert exposes the timeline's stage-to action without separate undo/redo controls. The reasoning toggle maps to the shared timeline's hidden/compact modes. The interaction module owns scroll refs, scroll-to-end updates, and the existing 250 ms pointer-gesture pause; nested scrollable regions do not pause following. |
| Recent and new sessions | `src/session/title.ts` and main-app `home/sessions`, `new-session`, and `session/header` feature boundaries | `src/home/sessions/directory-sync-recent-compact.ts`, `src/home/sessions/recent-compact.ts`, `src/home/sessions/switcher-compact.ts`, `src/new-session/controller-compact.ts`, `src/session/recovery-compact.ts` | Compact header only; no home route, grouping, search, workspace selection, or background open. Session-title normalization follows the main app and its shared fallback utility. |
| Shared leaf utilities | `src/runtime/persistence/base64.ts`, `src/runtime/platform/file-picker.ts`, `src/runtime/persistence/uuid.ts`, `src/runtime/server/errors.ts`, `src/shell/commands/search-keydown.ts`, `src/shell/commands/menu-dismiss.ts`, shared `@opencode/schema/session-message` | `src/shell/errors/readable.ts` | Shared leaf boundaries stay local; menu dismissal owns deferred actions and trigger-focus restoration. The shared schema mints explicit message IDs. Structured and legacy error messages are formatted by `runtime/server/errors.ts`; the compact shell wrapper only supplies locale and fallback text. |

The September 19 composer pass enables the main app's default follow-up delivery: Enter steers the active turn,
while Mod+Enter or the Queue action queues a prompt. Idle submissions start normally, including Mod+Enter. During
work the submit button shows Stop for an empty draft and Send for a nonempty draft. The server owns the pending
inbox; `session/composer/queue.ts` and `queue-panel.tsx` expose queued prompts, promotion, and removal. Queued prompts
remain outside the nine-dialog timeline until delivered. Queue submissions preserve the running turn's model and
agent configuration, recording the intended selection in metadata as the main app does. Queued editing and drag
reordering remain omitted from this compact view; the editor accepts these optional operations when supplied.

The compact current-message cache also owns inbox hydration and SSE reconciliation. Snapshots overtaken by inbox
changes are discarded and refreshed through the existing refresh queue. Old-session results cannot change the
active queue, and failed follow-up submissions preserve the draft and the running status. Queue copy uses English
source strings with the existing locale fallback. Runtime and build dependencies remain package-local.

Validation passes `bun test` (263 tests), `bun run typecheck`, and `bun run build`. A production-built browser fixture
with the real client and an in-memory server transport verifies toolbar and keyboard delivery, send/stop switching,
queue removal/promotion, blocked editing, and desktop/mobile layouts. It does not send prompts to a live model.
A production-mode event-reduction benchmark (20 warmups, 100 samples, 60 enqueue/delivery events per sample) measured
median/p95 times of 0.026/0.042 ms before and 0.038/0.063 ms after this pass. This measures local event processing,
not rendering or network latency.

The September 18 pass adds the main app's `runtime/server/request-queue.ts` boundary and colocated tests as
package-owned sources. Admission starts immediately when a slot is available, with at most four requests in flight,
at most two of them slow. Header timeouts release stalled slots without limiting streamed response bodies.
Cancelled waiting requests leave immediately, and synchronous transport errors also release their slots. The
compact SDK owns queue sharing across repeated server/directory client creation; this remains in
`client-compact.ts` because 7777 has no reactive SDK provider. No main-app runtime or build dependency is introduced.

The editor also adopts the main app's `shouldHandlePasteAsAttachment` helper in `composer/editor/interaction.ts`.
Clipboard files still become attachments; text formats, including HTML-only clipboard data, no longer invoke the
native image fallback. Plain multiline text retains its existing literal insertion and single-step undo behavior.

The September 17 pass aligned session composer ownership with the main app's `controller.ts` and `region.tsx`.
`screen.tsx` now connects an active region to the timeline and composer view. The dock view no longer constructs
an editor, and its controller no longer imports the server store, model selection, or submission implementation.
The active-session adapter accepts controls and editing availability rather than depending on the dock controller.
Request transitions and session changes retain the same editor instance and the existing single-draft policy.

The earlier DOM and timeline boundaries remain: cursor reads and restoration live in `composer/editor/dom.ts`,
while timeline pointer handling and scroll-to-end scheduling live in `session/timeline/interaction.ts`.
Attachment capture retains its separate range-start calculation and zero-width stripping. The nine-dialog window,
header counter, reasoning toggle, `SET_DOCUMENT_TITLE`, and `manageModels` controls remain.

The shared client's current contract is used for directory form loading, session form replies/cancellation, and
permission decisions. Request tests use the real shared client with an in-memory HTTP transport to verify methods,
paths, payloads, and the owning session. The existing two-step web-search protocol remains unchanged.

Draft persistence retains the `composer/schema.ts` and `runtime/persistence/schema.ts` boundaries, the same
localStorage key, and the same serialized format. Invalid attachments are recovered independently; source paths,
blob IDs, and legacy data URLs survive. Provider catalog IDs remain separate from API model names, saved API IDs
migrate only when their provider-scoped match is unambiguous, and source defaults and visibility gates remain.

Against the refreshed upstream tree, this pass increases shared source paths from 85 to 87; 19 are byte-for-byte
matches. The lower identical-file count than the September 17 review reflects intervening upstream changes; this
pass does not reduce the count against the refreshed tree. All five shared public assets remain identical.
Validation passes `bun test` (247 tests), `bun run typecheck`, and `bun run build`. Transport tests cover concurrency,
SSE bypass, cancellation, deadlines, synchronous failures, and queue sharing without mixing client credentials.
The running app passes multiline paste/undo, recent-session loading, and model-menu smoke checks.

The September 17 production composer benchmark remains the last mount/dispose measurement: 20 warmups and 100
samples measured median/p95 times of 0.4/0.7 ms before and 0.5/0.7 ms after that change. It measured the composer
only, not full-session rendering or network latency; the September 18 pass does not change session/timeline code.

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
