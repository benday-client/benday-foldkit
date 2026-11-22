// SPDX-License-Identifier: GPL-3.0-only
/**
 * Reads a Vitest or Playwright JSON report and refuses a run that did not
 * actually execute the tests it claims to cover: zero selected tests, skipped
 * or pending cases, focused-only selection and a browser run missing one of
 * its three engines all fail here even when the runner's own exit code is 0.
 */
import { readFileSync } from 'node:fs'

const PLAYWRIGHT_PROJECTS = ['chromium', 'firefox', 'webkit'] as const

function fail(message: string): never {
  throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number') fail(`report field ${key} is not a number`)
  return value
}

interface VitestAssertion {
  readonly status?: unknown
  readonly mode?: unknown
}

function vitestStatuses(report: Record<string, unknown>): readonly unknown[] {
  const files = report['testResults']
  if (!Array.isArray(files)) fail('vitest report has no testResults array')
  const statuses: unknown[] = []
  for (const file of files) {
    if (!isRecord(file) || !Array.isArray(file['assertionResults'])) continue
    for (const assertion of file['assertionResults'] as readonly unknown[]) {
      if (isRecord(assertion)) statuses.push((assertion as VitestAssertion).status)
    }
  }
  return statuses
}

function checkVitest(path: string): void {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(raw)) fail('vitest report is not an object')

  const total = numberField(raw, 'numTotalTests')
  const passed = numberField(raw, 'numPassedTests')
  const failed = numberField(raw, 'numFailedTests')
  const pending = numberField(raw, 'numPendingTests')
  const todo = numberField(raw, 'numTodoTests')

  if (total === 0) fail('vitest executed zero tests')
  if (failed !== 0) fail(`vitest reported ${String(failed)} failed tests`)
  if (pending !== 0) fail(`vitest reported ${String(pending)} skipped tests`)
  if (todo !== 0) fail(`vitest reported ${String(todo)} todo tests`)
  if (passed !== total) fail(`vitest passed ${String(passed)} of ${String(total)}`)

  const unusable = vitestStatuses(raw).filter(
    (status) => status === 'skipped' || status === 'pending' || status === 'todo',
  )
  if (unusable.length > 0) fail(`vitest report contains ${String(unusable.length)} unusable cases`)
}

interface PlaywrightTest {
  readonly projectName?: unknown
  readonly results?: readonly { readonly status?: unknown }[]
}

interface PlaywrightSpec {
  readonly tests?: readonly PlaywrightTest[]
}

interface PlaywrightSuite {
  readonly specs?: readonly PlaywrightSpec[]
  readonly suites?: readonly PlaywrightSuite[]
}

function collectSpecs(suites: readonly PlaywrightSuite[], into: PlaywrightSpec[]): void {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) into.push(spec)
    collectSpecs(suite.suites ?? [], into)
  }
}

function checkPlaywright(path: string): void {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(raw)) fail('playwright report is not an object')

  const stats = raw['stats']
  if (!isRecord(stats)) fail('playwright report has no stats')
  const expected = numberField(stats, 'expected')
  const unexpected = numberField(stats, 'unexpected')
  const skipped = numberField(stats, 'skipped')
  const flaky = numberField(stats, 'flaky')

  if (expected === 0) fail('playwright executed zero tests')
  if (unexpected !== 0) fail(`playwright reported ${String(unexpected)} unexpected tests`)
  if (skipped !== 0) fail(`playwright reported ${String(skipped)} skipped tests`)
  if (flaky !== 0) fail(`playwright reported ${String(flaky)} flaky tests`)

  const config = raw['config']
  const projects = isRecord(config) ? config['projects'] : undefined
  if (!Array.isArray(projects)) fail('playwright report has no project list')
  const names = projects
    .map((project) => (isRecord(project) ? project['name'] : undefined))
    .filter((name): name is string => typeof name === 'string')
  for (const required of PLAYWRIGHT_PROJECTS) {
    if (!names.includes(required)) fail(`playwright report is missing the ${required} project`)
  }

  const executed = new Map<string, number>()
  const specs: PlaywrightSpec[] = []
  const suites = raw['suites']
  if (Array.isArray(suites)) collectSpecs(suites as readonly PlaywrightSuite[], specs)
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      const project = typeof test.projectName === 'string' ? test.projectName : 'unknown'
      const ran = (test.results ?? []).filter((result) => result.status === 'passed').length
      executed.set(project, (executed.get(project) ?? 0) + ran)
    }
  }
  for (const required of PLAYWRIGHT_PROJECTS) {
    if ((executed.get(required) ?? 0) === 0) {
      fail(`playwright project ${required} executed no passing test`)
    }
  }
}

const [mode, path] = process.argv.slice(2)
if ((mode !== 'vitest' && mode !== 'playwright') || path === undefined) {
  fail('usage: check-test-results.ts <vitest|playwright> <report.json>')
}
if (mode === 'vitest') checkVitest(path)
else checkPlaywright(path)
console.log(`test results ok: ${mode} ${path}`)
