# Repository Guidelines

## PLM meeting checkout

- This checkout uses branch `plm-meeting` and package name `@opencode/plm-meeting` in the same Git repository as the sibling `7777` checkout.
- The meeting desktop tab loads this branch's `plm-meeting/index.html`; the 7777 tab loads `7777/index.html`. Keep agent identity, welcome content, and session/draft storage keys in the distribution's `sigmaagents.jsonc`, with the PLM meeting prompt in `agents/plm-meeting.md`.
- `bun run build` builds this checkout into its own `dist/`; `dev` and `serve` use this checkout too. Remove only the known legacy link to `../7777/dist` before building. Never build through that link or modify the sibling output.
- Keep meeting-specific UI, including the recorder, in this branch. The desktop-tab manifest must build and package both renderer outputs separately.
- The original desktop renderer remains a separate build.

## Project Structure & Module Organization

This package is a copy of the small SolidJS/Vite workspace app under `packages/7777`, checked out at `packages/plm-meeting`. This guide is copied and adapted from `<repo-root>/packages/app/AGENTS.md`; reference that file when aligning with the main app. Runtime code lives in `src/`, with UI logic in `src/entry.tsx`, global styles in `src/index.css`, and ambient types in `src/env.d.ts`. `index.html` is the Vite entry document. Build output goes to `dist/`; generated TypeScript declarations go under `node_modules/.ts-dist/`. Do not commit `dist`, `node_modules/`, or `.turbo/`.

The Vite config uses `@` as an alias for `./src` and serves package-owned assets from `./public`. Keep those assets
local; this nested repository must not require files from `../app` at runtime or build time.

## Build, Test, and Development Commands

Use Bun from the monorepo root or this package.

- `bun run dev`: start this checkout's Vite dev server on port `4778`.
- `bun test`: run the colocated Bun test suite.
- `bun run build`: build this checkout with Vite into its own `dist/`.
- `bun run serve`: preview the production build locally.
- `bun run typecheck`: run `tsgo -b` using `tsconfig.json`.
- From the repo root, use `bun run --cwd packages/plm-meeting <script>`.

## Coding Style & Naming Conventions

Write TypeScript with `strict` mode assumptions and SolidJS JSX (`jsxImportSource: solid-js`). Prefer `createStore` for app state rather than many independent `createSignal` calls. Keep imports grouped by external packages, local styles, then local modules. Use camelCase for functions and variables, PascalCase for types, and UPPER_SNAKE_CASE for constants. The root Prettier config uses no semicolons and a `120` character print width; match the existing two-space indentation.

Treat object values in Solid stores as mutable, even when the source variable is named like a constant. Never initialize `createStore` state with a shared object instance that is also reused as a sentinel or reset value; create a fresh object for the store and freeze exported sentinels when practical. Remember that nested `setState` updates and `reconcile` can mutate the existing raw store object in place.

## Testing Guidelines

Tests are colocated with the code they cover and run with `bun test`; there is no separate `test` script in `package.json`. For changes, run `bun test`, `bun run typecheck`, and `bun run build` at minimum. Place focused tests near the feature or in a clearly named test directory, using names like `entry.session.test.ts`.

For state-transition regressions, assert against literal or freshly created expected values rather than the same sentinel object used by the implementation. When shared constants are involved, explicitly verify that transitions do not mutate them; otherwise implementation and expectation can be corrupted together and produce a false-positive test.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Add drag support.` and `Make HISTORY_DIALOG_LIMIT looks right in Windows`. Keep subjects concise and scoped to the visible behavior. Pull requests should include a brief description, validation steps (`bun run typecheck`, `bun run build`), linked issues when applicable, and screenshots or recordings for UI changes.

## Configuration Notes

In development, the client resolves the opencode server from `VITE_OPENCODE_SERVER_HOST` and `VITE_OPENCODE_SERVER_PORT`, defaulting to `localhost:4096`. Avoid committing local credentials or session data.

## Agent-Specific Instructions

Prioritize stability, simplicity, then performance. Do not restart the app or server process while debugging unless explicitly requested. For browser verification, use the available automation tools and re-check the page after interactions.

When a UI status disagrees with the server response, inspect the network result and the in-memory store value separately before adding event handlers, retries, or polling. Reproduce the smallest local state transition and check for shared-reference mutation first.

`packages/plm-meeting` is a linked Git worktree of the nested `7777` repository, and the parent monorepo ignores `packages/plm-meeting/`. Run `git status`, `git diff`, and related checks from `<repo-root>/packages/plm-meeting` when reviewing changes in this package; running them from the parent repo will not show the package changes.

When moving, splitting, or adding a feature that also exists in `<repo-root>/packages/app`, follow the main app filename and module boundary for that feature. If the 7777 implementation intentionally remains in a different file or is 7777-only, update the `Code Layout Parity Review` section in `README.md` in the same change.

For public-facing docs and reference configs, use placeholders such as `<repo-root>`, `<knowledge-base-folder>`, and `<optional-secondary-search-tool>` instead of personal home directories, private company names, internal network paths, credentials, or proprietary tool names.

## Intentional Product Constraints

Some compact-app decisions are deployment requirements rather than removable parity gaps:

- Keep the `SET_DOCUMENT_TITLE` control. 7777 is embedded in another web app, whose document title must remain under the embedding host's control; the default `false` value is intentional rather than dead configuration.
- Keep the `manageModels` source configuration. 7777 deployments intentionally decide whether users can open the model manager while retaining source-controlled model defaults and visibility.
- Keep `HISTORY_DIALOG_LIMIT` at nine and preserve the header's `current/9` counter. The latest-nine dialog window is an intentional bounded experience. Cursor-based message loading may fetch older server pages to fully hydrate that window, but must not expand or remove the visible limit and counter without an explicit product decision.
