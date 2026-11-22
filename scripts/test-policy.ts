// SPDX-License-Identifier: GPL-3.0-only
/**
 * Runs each known-bad fixture through the real command and a clean fixture
 * through the same command as a positive control.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'benday-policy-'))

const SPDX = '// SPDX-License-Identifier: GPL-3.0-only'

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${content}\n`)
}

function run(command: string, args: readonly string[], cwd: string): number {
  return spawnSync(command, args, { cwd, encoding: 'utf8' }).status ?? 1
}

interface Case {
  readonly name: string
  readonly expected: 'pass' | 'fail'
  readonly run: () => number
}

const cases: Case[] = []

function expectRejected(name: string, execute: () => number): void {
  cases.push({ name, expected: 'fail', run: execute })
}

function expectAccepted(name: string, execute: () => number): void {
  cases.push({ name, expected: 'pass', run: execute })
}

const tsconfig = (includes: readonly string[]): string =>
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2023',
        lib: ['ES2024', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        types: [],
      },
      include: [...includes],
    },
    null,
    2,
  )

try {
  rmSync(work, { recursive: true, force: true })

  // policy content classes -------------------------------------------------
  const policyFixtures: Record<string, { expected: 'pass' | 'fail'; body: string }> = {
    clean: { expected: 'pass', body: `${SPDX}\nexport const value = 1` },
    suppression: {
      expected: 'fail',
      body: `${SPDX}\n// ${['@ts', 'ignore'].join('-')}\nexport const value: number = 'x'`,
    },
    'ambient-module': {
      expected: 'fail',
      body: `${SPDX}\ndeclare module 'external' {\n  export const value: number\n}`,
    },
    'ambient-global': {
      expected: 'fail',
      body: `${SPDX}\ndeclare global {\n  interface Window {\n    probe: string\n  }\n}`,
    },
    focused: {
      expected: 'fail',
      body: `${SPDX}\nit.only('probe', () => undefined)`,
    },
  }

  for (const [name, fixture] of Object.entries(policyFixtures)) {
    const directory = join(work, 'policy', name)
    const fileName = name === 'focused' ? 'fixture.test.ts' : 'fixture.ts'
    write(join(directory, fileName), fixture.body)
    const status = run('pnpm', ['exec', 'tsx', 'scripts/check-policy.ts', '--scan', directory], root)
    if (fixture.expected === 'pass') expectAccepted(`policy/${name}`, () => status)
    else expectRejected(`policy/${name}`, () => status)
  }

  // lint classes -----------------------------------------------------------
  const lintFixtures: Record<string, { expected: 'pass' | 'fail'; body: string }> = {
    clean: { expected: 'pass', body: `${SPDX}\nexport const value: number = 1` },
    any: { expected: 'fail', body: `${SPDX}\nexport const value: any = 1` },
    cast: {
      expected: 'fail',
      body: `${SPDX}\nexport const value = {} as unknown as { a: number }`,
    },
    nonnull: {
      expected: 'fail',
      body: `${SPDX}\nconst value: string | null = null\nexport const ok = value!.length`,
    },
    focused: { expected: 'fail', body: `${SPDX}\nit.only('probe', () => undefined)` },
  }

  for (const [name, fixture] of Object.entries(lintFixtures)) {
    const directory = join(work, 'lint', name)
    write(join(directory, 'fixture.ts'), fixture.body)
    write(join(directory, 'tsconfig.json'), tsconfig(['fixture.ts']))
    const status = run(
      'pnpm',
      [
        'exec',
        'effect-tsgo',
        'oxlint',
        '--type-aware',
        '--deny-warnings',
        '--config',
        '.oxlintrc.json',
        '--tsconfig',
        join(directory, 'tsconfig.json'),
        join(directory, 'fixture.ts'),
      ],
      root,
    )
    if (fixture.expected === 'pass') expectAccepted(`lint/${name}`, () => status)
    else expectRejected(`lint/${name}`, () => status)
  }

  // test discovery classes -------------------------------------------------
  const vitestCases: Record<string, { expected: 'pass' | 'fail'; body: string }> = {
    clean: {
      expected: 'pass',
      body: `import { expect, it } from 'vitest'\nit('probe', () => expect(1).toBe(1))`,
    },
    focused: {
      expected: 'fail',
      body: `import { expect, it } from 'vitest'\nit.only('probe', () => expect(1).toBe(1))`,
    },
    skipped: {
      expected: 'fail',
      body: `import { expect, it } from 'vitest'\nit.skip('probe', () => expect(1).toBe(1))`,
    },
    empty: { expected: 'fail', body: `// no tests here` },
  }

  for (const [name, fixture] of Object.entries(vitestCases)) {
    const directory = join(work, 'vitest', name)
    const report = join(directory, 'report.json')
    write(join(directory, 'probe.test.ts'), fixture.body)
    write(
      join(directory, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['probe.test.ts'], environment: 'node', allowOnly: false, passWithNoTests: false, retry: 0 } })`,
    )
    const status = run(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--root',
        directory,
        '--config',
        join(directory, 'vitest.config.ts'),
        '--reporter=json',
        `--outputFile=${report}`,
      ],
      root,
    )
    const guardStatus =
      status === 0
        ? run('pnpm', ['exec', 'tsx', 'scripts/check-test-results.ts', 'vitest', report], root)
        : status
    if (fixture.expected === 'pass') expectAccepted(`vitest/${name}`, () => guardStatus)
    else expectRejected(`vitest/${name}`, () => guardStatus)
  }

  // a browser report missing an engine must be rejected ---------------------
  const playwrightCase = join(work, 'playwright')
  write(
    join(playwrightCase, 'probe.spec.ts'),
    `import { test } from '@playwright/test'\ntest('trivial', () => undefined)`,
  )
  write(
    join(playwrightCase, 'playwright.config.ts'),
    `import { defineConfig } from '@playwright/test'\nexport default defineConfig({ testDir: '.', reporter: [['json', { outputFile: 'report.json' }]], projects: [{ name: 'chromium' }] })`,
  )
  const playwrightReport = join(playwrightCase, 'report.json')
  rmSync(playwrightReport, { force: true })
  const runnerStatus = run(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', join(playwrightCase, 'playwright.config.ts')],
    root,
  )
  if (runnerStatus !== 0) {
    throw new Error(`browser control could not run, so it cannot reject the missing engines (${String(runnerStatus)})`)
  }
  if (!existsSync(playwrightReport)) {
    throw new Error('browser control produced no report, so it cannot reject the missing engines')
  }
  expectRejected('playwright/missing-engines', () =>
    run('pnpm', ['exec', 'tsx', 'scripts/check-test-results.ts', 'playwright', playwrightReport], root),
  )

  let failures = 0
  for (const testCase of cases) {
    const status = testCase.run()
    const passed = testCase.expected === 'pass' ? status === 0 : status !== 0
    if (!passed) {
      failures += 1
      console.error(
        `${testCase.name}: expected the gate to ${testCase.expected}, got status ${String(status)}`,
      )
    }
  }
  if (failures > 0) throw new Error(`${String(failures)} policy fixture(s) did not behave`)
  console.log(`policy fixtures ok: ${String(cases.length)} cases, positive controls included`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
