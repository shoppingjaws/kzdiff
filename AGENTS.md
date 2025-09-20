# Repository Guidelines

## Project Structure & Module Organization
Source is under `src/`, with CLI orchestration in `src/cli.ts`, Kustomize helpers in `src/kustomize.ts`, filtering in `src/filter.ts`, and YAML comparison utilities in `src/yaml-diff/`. Tests live alongside modules as `*.test.ts`; integration fixtures reside in `src/yaml-diff/integration-test/`. Example manifests for manual experiments are kept in `examples/`.

## Build, Test, and Development Commands
Use `bun test` for the full suite and `bun test:unit` to skip CLI integrations. Targeted checks exist for YAML tooling (`bun run test:yaml`) and the CLI (`bun run test:cli`). Format and lint with Biome via `bun run format` and `bun run lint`. Compile a standalone binary locally with `bun run build`, and run `bun run typecheck` before publishing to catch type regressions.

## Coding Style & Naming Conventions
The project uses TypeScript in Bun's ESM mode. Keep imports sorted logically (builtin → external → local) and prefer small, composable functions. Tabs are used for indentation; avoid mixing spaces. Follow Biome defaults for spacing and quotes, and run the formatter before pushing. Tests, modules, and helper utilities follow `kebab-case` filenames; exported symbols use `camelCase`, while constructors stay `PascalCase`.

## Testing Guidelines
Rely on Bun's built-in test runner. Name specs with the `.test.ts` suffix and mirror the file under test (e.g., `kustomize.ts` → `kustomize.test.ts`). Include realistic fixtures in `src/yaml-diff/integration-test/` when adding complex diff scenarios. New features should extend unit coverage and, when user-visible behavior changes, add an integration test to `src/cli.test.ts`. Always run `bun test` before submitting a PR.

## Commit & Pull Request Guidelines
Follow the existing Git history convention of `type: short description` (e.g., `fix: handle empty overlays`). Squash noisy WIP commits locally. Pull requests should describe intent, list validation steps (`bun test`, `bun run format`), and reference related issues. Include screenshots or sample diff outputs when the CLI output changes. Request review once CI is green and the branch is synced with `main`.

## Tooling & Environment
Tool versions are pinned via `mise`. Run `mise install` after cloning to provision Bun ≥1.2.19, Kustomize 5.7.1, and Biome. Keep `bun.lock` committed; if dependencies change, regenerate with `bun install` and note the update in the PR description.
