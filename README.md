# @opencode/7777 [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Eric-Guo/opencode-agent-7777)

This package is the SolidJS/Vite UI for the `7777` agent.

## Set up both agents on a new developer machine

Install Git and the Bun version specified by the OpenCode root `package.json`. Start with the OpenCode distribution
checked out at `<repo-root>`, including its `.gitmodules`. The agent repository's configured remote must contain both
`main` and `plm-meeting`; publish the renderer changes on both branches before setting up another machine.
The distribution must also include the updated desktop-tab extension, both entries in
`packages/desktop/resources/thape-config/sigmaagents.jsonc`, and the `agents/plm-meeting.md` server profile.
Uncommitted changes on an existing machine are not transferred by these commands.

Initialize the distribution's existing submodules. Their repository URLs come from `.gitmodules`:

```bash
cd "<repo-root>"
git submodule update --init --recursive -- packages/7777 packages/desktop-tab packages/desktop/resources/thape-config
```

Use `packages/7777` as the primary worktree on `main`, then add a linked worktree for the published `plm-meeting`
branch. Run this once on the new machine, with `packages/plm-meeting` absent:

```bash
cd "<repo-root>/packages/7777"
git fetch origin
git switch main
git merge --ff-only origin/main
git worktree add --track -b plm-meeting ../plm-meeting origin/plm-meeting
git worktree list
```

The resulting layout is:

```text
<repo-root>/packages/
  7777/          # main; owns the 7777 renderer source and build
  plm-meeting/   # plm-meeting; owns the meeting renderer, including recording controls
  desktop-tab/  # desktop extension that loads both agents
  desktop/      # original desktop host and its separate renderer
```

Both agent worktrees share Git objects and remotes, while their branches and working files remain independent.
If the local `plm-meeting` branch already exists, use `git worktree add ../plm-meeting plm-meeting` instead of creating
it with `-b`. If `origin/plm-meeting` is missing, publish that branch from the existing machine first; creating it
from `main` alone will not include its meeting UI or its distinct `@opencode/plm-meeting` package name.
Submodule updates can detach `7777` at the distribution's recorded commit; switch back to `main` when resuming
renderer development.

Install workspace dependencies after both worktrees exist, then build both renderers and the desktop shell:

```bash
cd "<repo-root>"
bun install
cd packages/desktop-tab
bun run build
```

That build runs each branch's own renderer build, then builds the desktop shell. The extension packages `7777/dist`
at `7777/` and `plm-meeting/dist` at `plm-meeting/`. The tabs load `7777/index.html` and `plm-meeting/index.html`
respectively, with their agent identity and session/draft keys supplied by `sigmaagents.jsonc`. Do not copy `dist`
or `node_modules` from the old machine. The meeting build removes the old `dist -> ../7777/dist` link before
building its own output, leaving the sibling output untouched. The original desktop renderer remains separate.

To run the desktop shell with both configured agents, use the extension's development command:

```bash
cd "<repo-root>/packages/desktop-tab"
bun dev
```

For renderer hot reload, run `bun dev` from `packages/7777` (port 4777) and `packages/plm-meeting` (port 4778)
in separate terminals, then start desktop-tab with:

```bash
ELECTRON_7777_RENDERER_URL=http://localhost:4777/ ELECTRON_PLM_MEETING_RENDERER_URL=http://localhost:4778/ bun dev
```

Each tab uses its own development server; an unset variable loads that tab's bundled HTML. For a desktop build,
run `bun run build` from `packages/desktop-tab`; it builds and packages both renderers. Keep meeting UI changes,
including the recorder, in `packages/plm-meeting`, and 7777 UI changes in `packages/7777`. Agent-specific identity,
welcome content, storage keys, and prompts remain in the distribution configuration.

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

Desktop tabs can share one copy of this renderer bundle and configure their current-session and draft persistence
through `storageKeys` in their `sigmaagents.jsonc` entry:

```json
"storageKeys": {
  "sessionID": "opencode.7777.session.id",
  "sessionDirectory": "opencode.7777.session.directory",
  "promptDraft": "opencode.7777.prompt.draft"
}
```

These values preserve the existing 7777 session and draft. Give another agent three different keys to keep its saved
session and draft independent while reusing the same `7777/index.html`. Desktop initialization supplies the keys
before session restoration or composer persistence. Old hosts that omit `storageKeys` and standalone deployments
use `src/new-session/agent-default-config.json`, whose defaults retain the existing keys. Changing a key selects a
different entry without migrating or deleting existing data. Model/UI preferences and accepted-prompt history are
unchanged by this configuration.

## Open Source Notes

This package should not depend on a contributor's local home directory or private company resources. Use
`<repo-root>` in documentation when referring to the monorepo checkout, and keep private agent prompts, internal
network paths, credentials, and localStorage dumps out of commits.

The production/private 7777 agent prompt is not included verbatim. A sanitized reference template lives at
`docs/reference/7777-agent.md`; copy and adapt it for a local OpenCode agent configuration if needed.

## Code Layout Parity Review

See [Code Layout Parity Review](docs/code_parity.md) for the module-boundary comparison with
`<repo-root>/packages/app` and the intentional compact-app differences.

Queued-prompt undo follows the main app's `session/composer/{queue,queue-panel,controller}` boundaries.
The local implementation restores text, inline attachments, and file mentions into the single persisted draft;
prompts with agent/skill references or hidden file context stay queued because the compact draft cannot retain them.

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

Use **Undo** on a queued prompt to move it back into the composer. It appends after any current draft text and
preserves existing attachments and file mentions. The prompt leaves the queue only after the server confirms
cancellation; failed requests leave both the queue and draft intact. Undo uses the full prompt text, including
notes hidden by a shorter queue preview. Prompts containing context the compact composer cannot retain stay
queued with an explanation. Editing in place and reordering queued prompts remain unavailable.

## Agent Welcome Content

The fallback local agent, welcome markdown, and suggested questions shown after clicking **New session** live in
`src/new-session/agent-default-config.json`. A desktop tab can override all three values during initialization. Suggested
questions populate the composer when clicked. The welcome markdown is presentation-only and is never included in the
prompt sent to the server. The 7777-only UI for this template feature lives in
`src/session/agent-welcome-compact.tsx`.

## Model Selector Defaults

See [Model Selector Defaults](docs/model-defaults.md) for selector behavior, source configuration fields,
and the localStorage-to-source update workflow.
