# Working in this repository

This file is the implementation guide. The acceptance record lives in
[`benday-client/notes`](https://github.com/benday-client/notes/blob/main/foldkit/acceptance.md);
when the two disagree, the acceptance record wins.

## Scope discipline

- Foundation is the only approved phase. Session ownership, reading surfaces,
  actions, composition, settings transfer, presentation parity, the old-app
  oracle and performance budgets each need their own approval before code lands.
- The React repository `benday-client/benday` is read-only. Do not install,
  generate or format inside it.
- Reuse only the artifacts listed in the approved reuse table, and record the
  source path, source SHA, target path and proof in the notes' acceptance
  record first.

## Authored files

- Every authored `.ts`/`.js` file starts with
  `// SPDX-License-Identifier: GPL-3.0-only`.
- No diagnostic or lint suppression: `@ts-ignore`, `@ts-expect-error`,
  `@ts-nocheck`, `oxlint-disable`, `eslint-disable`, `biome-ignore`,
  `prettier-ignore` all fail `pnpm check:policy`.
- No `any`. Unvalidated input is `unknown` and gets a guard or a schema parse.
  Type assertions are for in-process values the compiler lost track of, never
  for external payloads.
- No authored `.d.ts`. The only allowlisted declaration is
  `apps/benday/src/vite-env.d.ts`, and it contains one
  `/// <reference types="vite/client" />` line.
- No ambient `declare` constructs, module augmentation or global widening.
- Tests are never focused or skipped; the report reader fails the run.

## TypeScript programs

- Libraries build with `tsconfig.build.json`: `NodeNext`, `declaration`,
  `rootDir: src`, `outDir: dist`, tests excluded.
- Libraries typecheck with `tsconfig.json`: same strict flags, tests included.
- The app uses bundler resolution; `apps/benday/tsconfig.json` also covers the
  Vite configuration so type-aware lint sees it.
- `tsconfig.json` at the root covers scripts, verification specs and tooling.
- Every authored file must appear in one of those programs. `check:policy`
  fails a file that no program includes.
- `skipLibCheck: true` in the shared base: dependency declarations belong to
  their authors and are not re-audited under our `exactOptionalPropertyTypes`
  settings. Our own sources keep every strict flag, and the dependency-free
  packages' emitted declarations are compiled by an external consumer with
  lib checking on (`scripts/check-packages.ts`). Do not add per-package
  `skipLibCheck` overrides.

## Foldkit conventions

- Messages are facts, never commands or prose.
- `update` matches the union exhaustively; every branch returns a Model and
  optionally Commands.
- Expected failures become tagged values in the Model. Defects reach the crash
  view.
- Model, Messages and Command/Mount arguments stay serializable: no DOM nodes,
  no promises, no agent/session handles, no functions.
- One Mount per element; combine element behaviours in that Mount.
- Commands capture their account/route/entity identity and are rechecked before
  they commit.

## Gates

Run the narrowest command that proves the change, then `pnpm check` once on the
candidate. Do not run builds, tests or formatters mid-edit inside a slice; the
integration owner runs them.

- `pnpm test -- <files>` still runs through the report reader.
- `pnpm test:browser -- <spec>` runs all three engine projects.
- CI runs the full fatal gate (`pnpm check`); run `pnpm check:static` locally
  (everything except the unit and browser suites).
- New behaviour lands with the test that would fail without it.
- `pnpm test:policy` is the proof that the gates themselves reject the
  prohibited classes; keep its positive controls green.

## Pull requests

- Every pull request needs an approving review from `qexat` before it merges.
- Keep a pull request semantically atomic: it must squash into one commit
  without losing useful information. Extra commits on the branch are for fixes
  and CI failures, never for unrelated changes.
- `main` merges by squash. The pull request title and body become the commit,
  so write them as the change.

## Git

- Commits are signed SSH commits as `lexa <me@lexa.qex.at>`.
- `main` is protected: pull requests only, no force pushes, no deletion, one
  aggregate `check` context, a required review and a squash merge.
- Use the selective commit namespace so other work in the tree is not captured.
