// SPDX-License-Identifier: GPL-3.0-only
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSourceIdentity } from '../apps/benday/vite/sourceIdentity.js'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const appRoot = join(root, 'apps', 'benday')

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${String(result.status)}`)
  }
}

run('pnpm', ['--filter', '@benday-client/benday', 'run', 'build'], root)

interface BuildIdentity {
  readonly sourceSha: string
  readonly sourceTree: string
}

function isBuildIdentity(value: unknown): value is BuildIdentity {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sourceSha' in value &&
    typeof value.sourceSha === 'string' &&
    'sourceTree' in value &&
    typeof value.sourceTree === 'string'
  )
}

const identityPath = join(appRoot, 'dist', 'build-identity.json')
const rawIdentity: unknown = JSON.parse(readFileSync(identityPath, 'utf8'))
if (!isBuildIdentity(rawIdentity)) {
  throw new Error(`build identity at ${identityPath} is not a build identity document`)
}

const current = readSourceIdentity(appRoot)
if (
  rawIdentity.sourceSha !== current.sourceSha ||
  rawIdentity.sourceTree !== current.sourceTree
) {
  throw new Error(
    `build identity ${rawIdentity.sourceSha}/${rawIdentity.sourceTree.slice(0, 12)} does not describe ${current.sourceSha}/${current.sourceTree.slice(0, 12)}`,
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
