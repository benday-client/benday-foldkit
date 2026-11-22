# development

## Prerequisites

- Node `^22.22.2 || ^24.15.0 || >=26.0.0` (verified on `24.21.0`)
- pnpm `12.16.1`, installed user-local

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
```

### WebKit on this Fedora host

WebKit's bundle links against Ubuntu-versioned `libicu74` and `libjpeg-turbo8`.
Copy those two `.deb` payloads' `.so` files into
`~/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib`; the bundle wrapper
replaces `LD_LIBRARY_PATH`, so an external path has no effect. CI uses
Playwright's own `--with-deps` instead. Chromium and Firefox run unmodified.

## Commands

| command | proves |
|---|---|
| `pnpm build:packages` | every library compiles to unbundled ESM plus declarations, topologically |
| `pnpm build:app` | the application bundles with the privacy configuration |
| `pnpm typecheck` | every package program, the app, scripts, configuration and verification specs |
| `pnpm lint` | the release-matched Foldkit preset plus Effect-aware type-aware Oxlint, warnings fatal |
| `pnpm check:policy` | license headers, authored-declaration ban, suppression ban, test placement, tsconfig coverage |
| `pnpm check:dev-privacy` | the real dev server serves no hot branch, websocket or relay |
| `pnpm test:policy` | known-bad and positive fixtures through the real gates |
| `pnpm test` | deterministic unit and contract tests, guarded by the report reader |
| `pnpm test:packages` | tarballs, publint strict, ATTW esm-only, an external strict consumer |
| `pnpm test:browser` | Chromium, Firefox and WebKit against a freshly built production artifact |
| `pnpm check:static` | the local gate: everything except the unit and browser suites |
| `pnpm check` | the whole gate in order |

`pnpm test:browser` rebuilds first and refuses to serve when
`dist/build-identity.json` does not describe the checked-out tree.

CI runs the full fatal gate (`pnpm check`) on the pull-request tree. Run
`pnpm check:static` locally before pushing; the test suites stay authoritative
in CI.

## Development privacy

The dev server is browser-local:

- `foldkitViewIdentity()` only, never the aggregate plugin
- `devTools: false`
- Vite's client is replaced by a local stub: no websocket, no HMR, no console
  forwarding
- `import.meta.hot` is defined away for builds and for the optimizer
- a full reload is required after a change; private model state is not preserved

`pnpm check:dev-privacy` starts the real server, reads the served HTML, every
app module and every optimizer entry, loads the page in Chromium and fails on a
hot branch, a websocket, a recording endpoint or a relay log line.
