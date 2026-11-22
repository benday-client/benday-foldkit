// SPDX-License-Identifier: GPL-3.0-only
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const appRoot = join(root, 'apps', 'benday')

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${String(result.status)}`)
  }
}

function git(args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

run('pnpm', ['--filter', '@benday-client/benday', 'run', 'build'], root)

interface BuildIdentity {
  readonly sourceSha: string
  readonly dirty: boolean
}

function isBuildIdentity(value: unknown): value is BuildIdentity {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sourceSha' in value &&
    typeof value.sourceSha === 'string' &&
    'dirty' in value &&
    typeof value.dirty === 'boolean'
  )
}

const identityPath = join(appRoot, 'dist', 'build-identity.json')
const rawIdentity: unknown = JSON.parse(readFileSync(identityPath, 'utf8'))
if (!isBuildIdentity(rawIdentity)) {
  throw new Error(`build identity at ${identityPath} is not a build identity document`)
}
const identity = rawIdentity

const head = git(['rev-parse', 'HEAD'])
const dirty = git(['status', '--porcelain']).length > 0
if (identity.sourceSha !== head || identity.dirty !== dirty) {
  throw new Error(
    `build identity ${identity.sourceSha}${identity.dirty ? '+dirty' : ''} does not describe ${head}${dirty ? '+dirty' : ''}`,
  )
}

const viteBin = join(root, 'node_modules', '.bin', 'vite')
const server = spawn(
  viteBin,
  ['preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  { cwd: appRoot, stdio: 'inherit', env: process.env },
)

const shutdown = (): void => {
  server.kill('SIGTERM')
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
server.on('exit', (code) => {
  process.exit(code ?? 0)
})
