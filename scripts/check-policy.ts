// SPDX-License-Identifier: GPL-3.0-only
/**
 * Fatal policy guard for the authored tree.
 *
 * It covers what the type checker and the linter cannot state by themselves:
 * every authored file is inside a real tsconfig program, every file carries
 * its license header, no file hides a diagnostic or lint suppression, and no
 * authored ambient declaration widens the type system. `--scan <dir>` runs the
 * same content rules against a fixture tree for the policy test.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import { spawnSync } from 'node:child_process'
import { isRecord } from './records.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DECLARATION_ALLOWLIST = new Set(['apps/benday/src/vite-env.d.ts'])
const SPDX = '// SPDX-License-Identifier: GPL-3.0-only'

// built from parts so this file never matches its own rule
const SUPPRESSIONS = [
  ['@ts', 'ignore'].join('-'),
  ['@ts', 'expect-error'].join('-'),
  ['@ts', 'nocheck'].join('-'),
  ['oxlint', 'disable'].join('-'),
  ['eslint', 'disable'].join('-'),
  ['biome', 'ignore'].join('-'),
  ['prettier', 'ignore'].join('-'),
]

const FOCUS_MARKERS = [
  ['.', 'only', '('].join(''),
  ['.', 'skip', '('].join(''),
  ['x', 'it', '('].join(''),
  ['x', 'describe', '('].join(''),
  ['f', 'it', '('].join(''),
  ['f', 'describe', '('].join(''),
]

interface SourceFile {
  readonly path: string
  readonly relative: string
}

function walk(directory: string): string[] {
  const entries: string[] = []
  for (const name of readdirSync(directory)) {
    const full = join(directory, name)
    const stats = statSync(full)
    if (stats.isDirectory()) entries.push(...walk(full))
    else entries.push(full)
  }
  return entries
}

function authoredFiles(): SourceFile[] {
  const roots = [
    ...readdirSync(join(root, 'packages')).map((name) => join(root, 'packages', name, 'src')),
    join(root, 'apps', 'benday', 'src'),
    join(root, 'apps', 'benday', 'vite'),
    join(root, 'scripts'),
    join(root, 'verification'),
  ]
  const single = [join(root, 'playwright.config.ts'), join(root, 'vitest.config.ts')]
  const files: SourceFile[] = []
  for (const directory of roots) {
    for (const path of walk(directory)) {
      if (path.endsWith('.ts') || path.endsWith('.js')) {
        files.push({ path, relative: relative(root, path) })
      }
    }
  }
  for (const path of single) files.push({ path, relative: relative(root, path) })
  return files.toSorted((left, right) => left.relative.localeCompare(right.relative))
}

function isTestFile(relativePath: string): boolean {
  return relativePath.endsWith('.test.ts') || relativePath.includes('verification/')
}

function checkContent(file: SourceFile): string[] {
  const problems: string[] = []
  const text = readFileSync(file.path, 'utf8')

  if (file.relative.endsWith('.d.ts') && !DECLARATION_ALLOWLIST.has(file.relative)) {
    problems.push(`${file.relative}: authored declaration files are not allowed`)
  }
  if (file.relative.endsWith('.js') && !text.startsWith(SPDX)) {
    problems.push(`${file.relative}: missing ${SPDX}`)
  }
  if (file.relative.endsWith('.ts') && !file.relative.endsWith('.d.ts') && !text.startsWith(SPDX)) {
    problems.push(`${file.relative}: missing ${SPDX}`)
  }

  for (const token of SUPPRESSIONS) {
    if (text.includes(token)) problems.push(`${file.relative}: prohibited suppression ${token}`)
  }

  if (isTestFile(file.relative)) {
    for (const marker of FOCUS_MARKERS) {
      if (text.includes(marker)) problems.push(`${file.relative}: prohibited test marker ${marker}`)
    }
  }

  const parsed = parse(text, {
    sourceType: 'module',
    plugins: ['typescript'],
    errorRecovery: false,
  })
  const ambient: string[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (!isRecord(node)) return
    const type = node['type']
    if (type === 'TSModuleDeclaration' || type === 'TSDeclareFunction') {
      ambient.push(type)
    }
    if (node['declare'] === true) ambient.push('declare modifier')
    for (const value of Object.values(node)) visit(value)
  }
  visit(parsed.program)
  for (const kind of new Set(ambient)) {
    problems.push(`${file.relative}: prohibited ambient construct ${kind}`)
  }

  return problems
}

function checkCoverage(files: readonly SourceFile[]): string[] {
  const configs = [
    join(root, 'tsconfig.json'),
    join(root, 'apps', 'benday', 'tsconfig.json'),
    ...readdirSync(join(root, 'packages')).map((name) =>
      join(root, 'packages', name, 'tsconfig.json'),
    ),
  ]

  const covered = new Set<string>()
  for (const config of configs) {
    const result = spawnSync('pnpm', ['exec', 'tsc', '-p', config, '--listFilesOnly'], {
      cwd: root,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      return [`${relative(root, config)}: listFilesOnly failed\n${result.stdout}${result.stderr}`]
    }
    for (const line of result.stdout.split('\n')) {
      if (!line.startsWith(root)) continue
      covered.add(relative(root, line.trim()))
    }
  }

  return files
    .filter((file) => !covered.has(file.relative))
    .map((file) => `${file.relative}: not included by any authored tsconfig program`)
}

function main(): void {
  const scanIndex = process.argv.indexOf('--scan')
  if (scanIndex >= 0) {
    const directory = process.argv[scanIndex + 1]
    if (directory === undefined) throw new Error('--scan requires a directory')
    const base = resolve(directory)
    const files: SourceFile[] = walk(base).map((path) => ({
      path,
      relative: relative(base, path),
    }))
    const problems = files.flatMap(checkContent)
    if (problems.length > 0) {
      throw new Error(`policy scan rejected ${String(problems.length)} problem(s)\n${problems.join('\n')}`)
    }
    console.log(`policy scan ok: ${String(files.length)} fixture files`)
    return
  }

  const files = authoredFiles()
  const problems = files.flatMap(checkContent)
  problems.push(...checkCoverage(files))
  if (problems.length > 0) {
    throw new Error(`policy check rejected ${String(problems.length)} problem(s)\n${problems.join('\n')}`)
  }
  console.log(`policy ok: ${String(files.length)} authored files, every one inside a tsconfig program`)
}

main()
