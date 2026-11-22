# libraries

Eight packages under `packages/`, one application under `apps/benday`. All are
ESM-only, unbundled, `private` and packable; nothing is published.

| package | entry points | responsibility |
|---|---|---|
| `@benday-client/richtext` | `.` | graphemes, UTF-8 facet offsets, labelled links, mention completion |
| `@benday-client/bsky-model` | `.`, `./interactions` | Effect Schemas, AT Protocol mappers, pure interaction reconciliation |
| `@benday-client/bsky-client` | `.`, `./session` | viewer-scoped read/write contract and browser session contract |
| `@benday-client/draft-store` | `.` | injected key/value drafts with revision-and-text cleanup |
| `@benday-client/deck` | `.`, `./browser` | key-first selection, axis-aware restore, scroller geometry |
| `@benday-client/dither` | `.` | deterministic Bayer tile and typed SVG filter graph |
| `@benday-client/media` | `.`, `./browser` | playback facts and element-scoped native/HLS lifecycle |
| `@benday-client/effect-query` | `.` | QueryClient/observer to Effect Stream bridge |

## Contract

`exports` maps put `types` before `import`; relative imports carry `.js`.
Every package declares its direct dependencies, and uses `workspace:*` for
sibling packages.

Runtime dependencies:

- `richtext`, `draft-store`, `deck`, `dither`: none
- `media`: `hls.js` plus the Effect peer
- `bsky-model`, `bsky-client`, `effect-query`: peer SDK/query/Effect packages

Pure entries import without `window`, `document`, storage, network or a runtime
start. `deck/browser`, `media/browser` and `bsky-client/session` only touch the
browser when their operations are called.

`bsky-client` currently ships the reviewed type contract for reads, writes and
session ownership. It exports no constructor and performs no I/O until the
identity phase is approved.

## Standalone use

`pnpm test:packages` builds every package without the app, packs real tarballs,
runs publint strict and ATTW `esm-only`, then installs them into a temporary
NodeNext project with sibling tarball overrides, no workspace links and no
`NODE_PATH`. A second consumer compiles the dependency-free packages with
`skipLibCheck: false`, so their emitted declarations are checked from outside.
