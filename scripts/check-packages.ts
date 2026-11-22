// SPDX-License-Identifier: GPL-3.0-only
/**
 * Independent-consumer proof for every reusable library.
 *
 * Each package is built without the app, packed into a real tarball, linted by
 * publint and Are the Types Wrong, then installed in a temporary NodeNext
 * project that has no workspace, no source aliases and no NODE_PATH fallback.
 * Pure entry points are imported at runtime with no browser globals present.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRecord } from './records.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface PackageSpec {
  readonly dir: string
  readonly name: string
  readonly entries: readonly string[]
  /** Whether every entry can be imported in Node without a browser. */
  readonly pureRuntime: boolean
}

const PACKAGES: readonly PackageSpec[] = [
  { dir: 'richtext', name: '@benday-client/richtext', entries: ['/dist/index.js'], pureRuntime: true },
  { dir: 'dither', name: '@benday-client/dither', entries: ['/dist/index.js'], pureRuntime: true },
  { dir: 'draft-store', name: '@benday-client/draft-store', entries: ['/dist/index.js'], pureRuntime: true },
  {
    dir: 'deck',
    name: '@benday-client/deck',
    entries: ['/dist/index.js', '/dist/browser.js'],
    pureRuntime: false,
  },
  {
    dir: 'effect-query',
    name: '@benday-client/effect-query',
    entries: ['/dist/index.js'],
    pureRuntime: true,
  },
  {
    dir: 'media',
    name: '@benday-client/media',
    entries: ['/dist/index.js', '/dist/browser.js'],
    pureRuntime: false,
  },
  {
    dir: 'bsky-model',
    name: '@benday-client/bsky-model',
    entries: ['/dist/index.js', '/dist/interactions.js'],
    pureRuntime: true,
  },
  {
    dir: 'bsky-client',
    name: '@benday-client/bsky-client',
    entries: ['/dist/index.js', '/dist/session/index.js'],
    pureRuntime: false,
  },
]

const PEERS: Readonly<Record<string, string>> = {
  effect: '4.1.5',
  '@tanstack/query-core': '5.105.0',
  '@atproto/api': '0.29.6',
  '@atproto/oauth-client-browser': '0.5.11',
  'hls.js': '1.7.4',
}

function run(command: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${String(result.status)}\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result.stdout
}

function fail(message: string): never {
  throw new Error(message)
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function checkManifest(spec: PackageSpec): void {
  const packageDir = join(root, 'packages', spec.dir)
  const manifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (!isRecord(manifest)) fail(`${spec.dir} manifest is not an object`)
  const record = manifest

  assertEqual(record['name'], spec.name, `${spec.dir} name`)
  assertEqual(record['version'], '0.1.0', `${spec.dir} version`)
  assertEqual(record['private'], true, `${spec.dir} private`)
  assertEqual(record['license'], 'GPL-3.0-only', `${spec.dir} license`)
  assertEqual(record['sideEffects'], false, `${spec.dir} sideEffects`)
  assertEqual(record['types'], './dist/index.d.ts', `${spec.dir} types`)
  assertEqual(record['files'], ['dist', 'LICENSE'], `${spec.dir} files`)

  const license = readFileSync(join(packageDir, 'LICENSE'))
  const rootLicense = readFileSync(join(root, 'LICENSE'))
  if (!license.equals(rootLicense)) fail(`${spec.dir} LICENSE differs from the root license`)

  const exportsField = record['exports']
  if (!isRecord(exportsField)) fail(`${spec.dir} has no exports map`)
  for (const [entry, target] of Object.entries(exportsField)) {
    if (!isRecord(target)) fail(`${spec.dir} ${entry} target is not an object`)
    const conditions = Object.keys(target)
    if (conditions[0] !== 'types' || conditions[1] !== 'import') {
      fail(`${spec.dir} ${entry} must declare types first and import second, got ${conditions.join(', ')}`)
    }
    const types = target['types']
    const impl = target['import']
    if (typeof types !== 'string' || !types.startsWith('./dist/')) fail(`${spec.dir} ${entry} types path`)
    if (typeof impl !== 'string' || !impl.startsWith('./dist/')) fail(`${spec.dir} ${entry} import path`)
    for (const path of [types, impl]) {
      if (!existsSync(join(packageDir, path))) fail(`${spec.dir} ${entry} is missing ${path}`)
    }
  }
}

interface Packed {
  readonly spec: PackageSpec
  readonly tarball: string
}

function pack(spec: PackageSpec, destination: string): Packed {
  const packageDir = join(root, 'packages', spec.dir)
  run('pnpm', ['pack', '--pack-destination', destination], packageDir)
  const fileName = `${spec.name.replace('@', '').replace('/', '-')}-0.1.0.tgz`
  const tarball = join(destination, fileName)
  if (!existsSync(tarball)) fail(`expected ${fileName} in ${destination}`)
  return { spec, tarball }
}

function checkTarball(packed: Packed): void {
  const packageDir = join(root, 'packages', packed.spec.dir)
  run('pnpm', ['exec', 'publint', 'run', packed.tarball, '--strict'], packageDir)
  run(
    'pnpm',
    ['exec', 'attw', packed.tarball, '--profile', 'esm-only', '--quiet'],
    join(root, 'packages', packed.spec.dir),
  )
}

const CONSUMER = `// SPDX-License-Identifier: GPL-3.0-only
import type { Effect, Scope } from 'effect'
import {
  firstGrapheme,
  insertSuggestion,
  measureText,
  parseMarkdown,
  safeHttpUrl,
  segmentText,
  suggestionAt,
  truncateGraphemes,
} from '@benday-client/richtext'
import { buildBayerPatternDataUri, buildBayerPatternSvg, createDitherFilter } from '@benday-client/dither'
import { createDraftStore } from '@benday-client/draft-store'
import { chooseRestoreMode, clampIndex, createDeckMemory, resolveIndex } from '@benday-client/deck'
import type { DeckPosition } from '@benday-client/deck'
import { nearestCardIndex, readSnapport, watchDeckRest } from '@benday-client/deck/browser'
import { formatMediaTime, reduceMedia } from '@benday-client/media'
import type { MediaState } from '@benday-client/media'
import type { VideoHandle } from '@benday-client/media/browser'
import { makeQueryCache } from '@benday-client/effect-query'
import type { QueryCache } from '@benday-client/effect-query'
import { mapAuthor } from '@benday-client/bsky-model'
import type { PostModel } from '@benday-client/bsky-model'
import { displayedCount } from '@benday-client/bsky-model/interactions'
import type { BskyClient, ViewerAccess } from '@benday-client/bsky-client'
import type { AuthSnapshot, SessionService } from '@benday-client/bsky-client/session'

const measured: { readonly graphemes: number; readonly bytes: number } = measureText('héllo')
const parsed: { readonly text: string; readonly facets: readonly unknown[] } = parseMarkdown('x')
const segments: readonly { readonly text: string }[] = segmentText(parsed.text, [])
const token = suggestionAt('hi @al', 6)
const inserted: { readonly text: string; readonly cursor: number } | null =
  token === null ? null : insertSuggestion('hi @al', token, 'alice')
const first: string = firstGrapheme('a')
const truncated: string = truncateGraphemes('abc', 2)
const safe: string | null = safeHttpUrl('https://example.com')

const svg: string = buildBayerPatternSvg()
const uri: string = buildBayerPatternDataUri()
const filter = createDitherFilter({
  id: 'consumer',
  dark: [[0, 0, 0], [1, 1, 1]],
  light: [[0, 0, 0], [1, 1, 1]],
})

const store = createDraftStore({
  storage: { getItem: () => null, setItem: () => undefined },
  storageKey: 'consumer',
  maxEntries: 20,
  now: () => 0,
  newRevision: () => 'r',
})

const index: number = clampIndex(3, 2)
const selection = resolveIndex({ index: 0, key: 'a' }, [{ key: 'a' }], (item) => item.key)
const mode: 'offset' | 'card' = chooseRestoreMode({
  saved: { axis: 'y', index: 0, key: 'a', offset: 0, anchor: 0 },
  axis: 'y',
  resolvedIndex: 0,
  leadingPeek: false,
  anchorDelta: 0,
  visibleRatio: 1,
})
const memory = createDeckMemory()
const saved: DeckPosition | undefined = memory.read('x')
const nearest: number | null = nearestCardIndex(document.createElement('div'), 'y', 0)
const port = readSnapport(document.createElement('div'), 'x')
const stop: () => void = watchDeckRest(document.createElement('div'), 'y', () => undefined)

const state: MediaState = reduceMedia({ _tag: 'Poster' }, { _tag: 'Playing' })
const time: string = formatMediaTime(12.5)
const handle: VideoHandle | null = null

const cache: Effect.Effect<QueryCache, never, Scope.Scope> = makeQueryCache({})

const post: PostModel | null = null
const mapped = mapAuthor({
  $type: 'app.bsky.actor.defs#profileViewBasic',
  did: 'did:plc:x',
  handle: 'x.test',
})
const count: number = displayedCount(1, null, 1)

const client: BskyClient | null = null
const access: ViewerAccess | null = null
const snapshot: AuthSnapshot | null = null
const session: SessionService | null = null

export const values = [
  measured, segments, token, inserted, first, truncated, safe, svg, uri, filter, store, index,
  selection, mode, saved, nearest, port, stop, state, time, handle, cache, post, mapped, count,
  client, access, snapshot, session,
]
`

const CONSUMER_RUNTIME = `// SPDX-License-Identifier: GPL-3.0-only
import { measureText, segmentText, parseMarkdown } from '@benday-client/richtext'
import { buildBayerPatternSvg, createDitherFilter } from '@benday-client/dither'
import { createDeckMemory } from '@benday-client/deck'
import { createDraftStore } from '@benday-client/draft-store'
import { reduceMedia, formatMediaTime } from '@benday-client/media'
import { mapAuthor } from '@benday-client/bsky-model'

const checks = [
  measureText('é').bytes === 2,
  segmentText('abc', []).length === 1,
  parseMarkdown('plain').text === 'plain',
  buildBayerPatternSvg().startsWith('<svg'),
  createDitherFilter({ id: 'x', dark: [[0, 0, 0], [1, 1, 1]], light: [[0, 0, 0], [1, 1, 1]] }).filters.length === 2,
  createDeckMemory().read('x') === undefined,
  createDraftStore({
    storage: { getItem: () => null, setItem: () => undefined },
    storageKey: 'x',
    maxEntries: 2,
    now: () => 0,
    newRevision: () => 'r',
  }).read('k').available === true,
  reduceMedia({ _tag: 'Poster' }, { _tag: 'Playing' })._tag === 'Ready',
  formatMediaTime(-1) === '0:00',
  mapAuthor({ $type: 'app.bsky.actor.defs#profileViewBasic', did: 'did:plc:x', handle: 'x' }).did === 'did:plc:x',
]

if (!checks.every(Boolean)) {
  throw new Error('a pure package import did not behave')
}
console.log('pure consumer ok')
`

const STRICT_PURE: readonly string[] = [
  '@benday-client/richtext',
  '@benday-client/dither',
  '@benday-client/deck',
  '@benday-client/draft-store',
]

const STRICT_PURE_CONSUMER = `// SPDX-License-Identifier: GPL-3.0-only
import { measureText, parseMarkdown, segmentText } from '@benday-client/richtext'
import type { FacetSpan, TextSegment } from '@benday-client/richtext'
import { buildBayerPatternSvg, createDitherFilter } from '@benday-client/dither'
import type { SvgFilterNode } from '@benday-client/dither'
import { chooseRestoreMode, clampIndex, createDeckMemory } from '@benday-client/deck'
import type { DeckPosition } from '@benday-client/deck'
import { createDraftStore } from '@benday-client/draft-store'
import type { DraftRead } from '@benday-client/draft-store'

const spans: readonly FacetSpan[] = parseMarkdown('x').facets
const segments: readonly TextSegment[] = segmentText('x', spans)
const measured: number = measureText('x').bytes
const tree: readonly SvgFilterNode[] = createDitherFilter({
  id: 'x',
  dark: [[0, 0, 0], [1, 1, 1]],
  light: [[0, 0, 0], [1, 1, 1]],
}).filters
const svg: string = buildBayerPatternSvg()
const index: number = clampIndex(0, 0)
const memory = createDeckMemory()
const position: DeckPosition | undefined = memory.read('k')
const mode: 'offset' | 'card' = chooseRestoreMode({
  saved: { axis: 'y', index: 0, key: null, offset: null, anchor: null },
  axis: 'x',
  resolvedIndex: 0,
  leadingPeek: false,
  anchorDelta: null,
  visibleRatio: 0,
})
const store = createDraftStore({
  storage: { getItem: () => null, setItem: () => undefined },
  storageKey: 'k',
  maxEntries: 1,
  now: () => 0,
  newRevision: () => 'r',
})
const read: DraftRead = store.read('k')

export const values = [segments, measured, tree, svg, index, position, mode, read]
`

/**
 * Our own emitted declarations are checked from the outside with lib checking
 * on. Only the dependency-free packages participate: an SDK or query library
 * would drag its authors' declarations into a check we do not own.
 */
function checkStrictPureDeclarations(
  packed: readonly Packed[],
  work: string,
): void {
  const selected = packed.filter((artifact) => STRICT_PURE.includes(artifact.spec.name))
  if (selected.length !== STRICT_PURE.length) fail('strict declaration consumer is missing a package')

  const directory = join(work, 'strict-pure')
  mkdirSync(directory)
  const dependencies: Record<string, string> = {}
  const overrides: Record<string, string> = {}
  for (const artifact of selected) {
    dependencies[artifact.spec.name] = `file:${artifact.tarball}`
    overrides[artifact.spec.name] = `file:${artifact.tarball}`
  }

  writeFileSync(
    join(directory, 'package.json'),
    `${JSON.stringify({ name: 'benday-strict-pure', private: true, type: 'module', dependencies }, null, 2)}\n`,
  )
  writeFileSync(
    join(directory, 'pnpm-workspace.yaml'),
    `overrides:\n${Object.entries(overrides)
      .map(([name, target]) => `  '${name}': ${target}`)
      .join('\n')}\nignoreScripts: true\n`,
  )
  writeFileSync(
    join(directory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          lib: ['ES2024', 'DOM'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          noImplicitOverride: true,
          noFallthroughCasesInSwitch: true,
          verbatimModuleSyntax: true,
          skipLibCheck: false,
          noEmit: true,
          types: [],
        },
        include: ['pure.ts'],
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(join(directory, 'pure.ts'), STRICT_PURE_CONSUMER)

  run('pnpm', ['install'], directory)
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], directory)
}

async function main(): Promise<void> {
  run('pnpm', ['run', 'build:packages'], root)

  const work = mkdtempSync(join(tmpdir(), 'benday-consumer-'))
  try {
    const tarballs = mkdtempSync(join(work, 'tarballs-'))
    const packed = PACKAGES.map((spec) => pack(spec, tarballs))

    for (const spec of PACKAGES) checkManifest(spec)
    for (const artifact of packed) checkTarball(artifact)

    const consumerDir = join(work, 'consumer')
    mkdirSync(consumerDir)

    const overrides: Record<string, string> = {}
    const dependencies: Record<string, string> = { ...PEERS }
    for (const { spec, tarball } of packed) {
      dependencies[spec.name] = `file:${tarball}`
      overrides[spec.name] = `file:${tarball}`
    }

    writeFileSync(
      join(consumerDir, 'package.json'),
      `${JSON.stringify({ name: 'benday-external-consumer', private: true, type: 'module', dependencies }, null, 2)}\n`,
    )
    // pnpm 12 reads overrides from the workspace settings file, not from a
    // package.json field. The sibling tarballs must win over the registry.
    writeFileSync(
      join(consumerDir, 'pnpm-workspace.yaml'),
      `overrides:\n${Object.entries(overrides)
        .map(([name, target]) => `  '${name}': ${target}`)
        .join('\n')}\n# the proof installs third-party tarballs only to compile against them; no\n# dependency install script runs in this temporary project\nignoreScripts: true\n`,
    )
    writeFileSync(
      join(consumerDir, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2023',
            lib: ['ES2024', 'DOM', 'DOM.Iterable'],
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            noImplicitOverride: true,
            noFallthroughCasesInSwitch: true,
            verbatimModuleSyntax: true,
            // the pinned atproto declarations are not written for
            // exactOptionalPropertyTypes; the consumer's own file still is
            skipLibCheck: true,
            noEmit: true,
            types: [],
          },
          include: ['consumer.ts'],
        },
        null,
        2,
      )}\n`,
    )
    writeFileSync(join(consumerDir, 'consumer.ts'), CONSUMER)
    writeFileSync(join(consumerDir, 'consumer-runtime.ts'), CONSUMER_RUNTIME)

    run('pnpm', ['install'], consumerDir)
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumerDir)

    // nothing may resolve back to the workspace sources
    writeFileSync(
      join(consumerDir, 'resolve.mjs'),
      `for (const spec of ['@benday-client/richtext','@benday-client/bsky-model']) console.log(import.meta.resolve(spec))\n`,
    )
    const resolved = run('node', ['resolve.mjs'], consumerDir)
    if (resolved.includes('packages/richtext/src') || resolved.includes('packages/bsky-model/src')) {
      fail(`consumer resolved workspace source: ${resolved}`)
    }
    if (!resolved.includes(join(consumerDir, 'node_modules'))) {
      fail(`consumer did not resolve its own installation: ${resolved}`)
    }

    const runtime = spawnSync(
      join(root, 'node_modules', '.bin', 'tsx'),
      [join(consumerDir, 'consumer-runtime.ts')],
      { cwd: consumerDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    )
    if (runtime.status !== 0) fail('pure consumer runtime import failed')
    if (!runtime.stdout.includes('pure consumer ok')) fail('pure consumer did not report success')

    checkStrictPureDeclarations(packed, work)

    console.log(
      `package proof ok: ${String(packed.length)} tarballs, publint strict, attw esm-only, strict consumers, pure imports green`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

await main()
