# benday-foldkit

The Foldkit rewrite of [benday](https://github.com/benday-client/benday), split
into reusable packages.

The React application stays the behaviour oracle until the ported surfaces pass
their recorded comparison.

Status: foundation slice only. The anonymous landing, the library kernels and
the proving gates exist; session ownership, reading surfaces, actions,
composition, settings transfer, presentation parity and performance budgets are
separately approved phases.

## Quick start

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

## Documentation

- [development](docs/development.md): prerequisites, host notes, commands, gates
- [libraries](docs/libraries.md): package boundaries, entry points, dependency contracts
- [acceptance](https://github.com/benday-client/notes/blob/main/acceptance/foldkit.md): what is proven, with evidence and open limits

## License

GPL-3.0-only. Nothing here authorizes deployment or publication.
