# benday-foldkit

The Foldkit rewrite of benday, split into reusable libraries. This repository is
the replacement implementation of
[`benday-client/benday`](https://github.com/benday-client/benday); the React
application stays the behaviour oracle until the ported surfaces pass their
recorded comparison.

Status: **foundation slice only.** The anonymous landing, the library kernels
and the proving gates exist. Session ownership, reading surfaces, actions,
composition, settings transfer, presentation parity, the frozen old-app oracle
and every performance budget are later, separately approved phases.

## Layout

| path | contents |
|---|---|
| `apps/benday` | the Foldkit application: route shell, styles, build configuration |
| `packages/richtext` | graphemes, UTF-8 facet offsets, labelled links, mention completion |
| `packages/bsky-model` | Effect Schemas, AT Protocol mappers, pure interaction reconciliation |
| `packages/bsky-client` | viewer-scoped read/write contract and the browser session contract |
| `packages/draft-store` | injected key/value drafts with revision-and-text cleanup |
| `packages/deck` | key-first selection, axis-aware restore, scroller geometry |
| `packages/dither` | deterministic Bayer tile and typed SVG filter graph |
| `packages/media` | playback facts and element-scoped native/HLS lifecycle |
| `packages/effect-query` | QueryClient/observer to Effect Stream bridge |
| `scripts` | gates: policy, package consumers, reports, privacy, reference capture |
| `verification/browser` | Playwright specs run against the production artifact |

## Prerequisites

- Node `^22.22.2 || ^24.15.0 || >=26.0.0` (this tree is verified on `24.21.0`)
- pnpm `12.16.1`, installed user-local

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
```

WebKit on this Fedora host links against Ubuntu-versioned `libicu74` and
`libjpeg-turbo8`. The verified workaround is to extract those two `.deb`
payloads and copy their `.so` files into
`~/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib`, because the bundle's
wrapper replaces `LD_LIBRARY_PATH`. CI uses Playwright's own `--with-deps`
instead. Chromium and Firefox run unmodified.

## Commands

| command | proves |
|---|---|
| `pnpm build:packages` | every library compiles to unbundled ESM plus declarations, topologically |
| `pnpm build:app` | the application bundles with the privacy configuration |
| `pnpm typecheck` | every package program, the app, scripts, configuration and verification specs |
| `pnpm lint` | the release-matched Foldkit preset plus Effect-aware type-aware Oxlint, warnings fatal |
| `pnpm check:policy` | license headers, authored-declaration ban, suppression ban, tsconfig coverage |
| `pnpm check:dev-privacy` | the real dev server serves no `import.meta.hot` preservation branch or relay |
| `pnpm test:policy` | known-bad and positive fixtures through the real gates |
| `pnpm test` | deterministic unit and contract tests, guarded by the report reader |
| `pnpm test:packages` | tarballs, publint strict, ATTW esm-only, an external strict consumer |
| `pnpm test:browser` | Chromium, Firefox and WebKit against a freshly built production artifact |
| `pnpm check` | the whole gate in order |

`pnpm test:browser` rebuilds first and refuses to serve when
`dist/build-identity.json` does not describe the checked-out tree.

CI runs the full fatal gate (`pnpm check`) on the pull-request tree. Locally,
run `pnpm check:static` (everything except the unit and browser suites) before
pushing; the test suites stay authoritative in CI.

## Library use

Libraries are ESM-only, unbundled, and connect through `exports` maps that put
`types` before `import`. Every package is `private` (nothing is published) but
packable: `pnpm test:packages` installs the tarballs into a temporary project
with sibling overrides, no workspace links and no `NODE_PATH`.

Runtime dependencies are deliberate:

- `richtext`, `draft-store`, `deck`, `dither`: none
- `media`: `hls.js` plus the Effect peer
- `bsky-model`, `bsky-client`, `effect-query`: peer SDK/query/Effect packages

Pure entries import without `window`, `document`, storage, network or a runtime
start. `deck/browser`, `media/browser` and `bsky-client/session` only touch the
browser when their operations are called.

`bsky-client` currently ships the reviewed **type contract** for reads, writes
and session ownership. It exports no constructor and performs no I/O until the
identity phase is approved.

## Development privacy

The dev server is deliberately browser-local:

- `foldkitViewIdentity()` only, never the aggregate plugin
- `devTools: false`
- no HMR, no WebSocket, no console forwarding
- `import.meta.hot` is defined away for builds and for the optimizer, so no
  preservation branch survives
- a full reload is required after a change, and private model state is not
  preserved

## License

GPL-3.0-only, no later version and no linking exception. Every package ships the
verbatim root `LICENSE`; `pnpm test:packages` proves it. Fonts keep their OFL
terms. Nothing here authorizes deployment, publication or binary distribution;
that needs a separately approved cutover with Corresponding Source available
beside the artifact.
