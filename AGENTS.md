# Repository Guidelines

## Project Structure & Module Organization

This package is a small SolidJS/Vite workspace app under `packages/7777`. This guide is copied and adapted from `<repo-root>/packages/app/AGENTS.md`; reference that file when aligning with the main app. Runtime code lives in `src/`, with UI logic in `src/entry.tsx`, global styles in `src/index.css`, and ambient types in `src/env.d.ts`. `index.html` is the Vite entry document. Build output goes to `dist/`; generated TypeScript declarations go under `node_modules/.ts-dist/`. Do not commit `dist/`, `node_modules/`, or `.turbo/`.

The Vite config uses `@` as an alias for `./src` and serves shared public assets from `../app/public`.

## Build, Test, and Development Commands

Use Bun from the monorepo root or this package.

- `bun run dev`: start the Vite dev server on port `4777`.
- `bun run build`: build the package with Vite into `dist/`.
- `bun run serve`: preview the production build locally.
- `bun run typecheck`: run `tsgo -b` using `tsconfig.json`.
- From the repo root, use `bun --cwd packages/7777 <script>`.

## Coding Style & Naming Conventions

Write TypeScript with `strict` mode assumptions and SolidJS JSX (`jsxImportSource: solid-js`). Prefer `createStore` for app state rather than many independent `createSignal` calls. Keep imports grouped by external packages, local styles, then local modules. Use camelCase for functions and variables, PascalCase for types, and UPPER_SNAKE_CASE for constants. The root Prettier config uses no semicolons and a `120` character print width; match the existing two-space indentation.

## Testing Guidelines

There is no local `test` script or test directory in this package yet. For changes, run `bun run typecheck` and `bun run build` at minimum. If adding tests later, place focused tests near the feature or in a clearly named test directory, using names like `entry.session.test.ts`.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Add drag support.` and `Make HISTORY_DIALOG_LIMIT looks right in Windows`. Keep subjects concise and scoped to the visible behavior. Pull requests should include a brief description, validation steps (`bun run typecheck`, `bun run build`), linked issues when applicable, and screenshots or recordings for UI changes.

## Configuration Notes

In development, the client resolves the opencode server from `VITE_OPENCODE_SERVER_HOST` and `VITE_OPENCODE_SERVER_PORT`, defaulting to `localhost:4096`. Avoid committing local credentials or session data.

## Agent-Specific Instructions

Prioritize stability, simplicity, then performance. Do not restart the app or server process while debugging unless explicitly requested. For browser verification, use the available automation tools and re-check the page after interactions.

When moving, splitting, or adding a feature that also exists in `<repo-root>/packages/app`, follow the main app filename and module boundary for that feature. If the 7777 implementation intentionally remains in a different file or is 7777-only, update the `Code Layout Parity Review` section in `README.md` in the same change.

For public-facing docs and reference configs, use placeholders such as `<repo-root>`, `<knowledge-base-folder>`, and `<optional-secondary-search-tool>` instead of personal home directories, private company names, internal network paths, credentials, or proprietary tool names.
