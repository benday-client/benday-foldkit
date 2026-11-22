// SPDX-License-Identifier: GPL-3.0-only
/**
 * Source identity for a built artifact.
 *
 * `sourceTree` binds tracked edits and untracked, non-ignored files, so a
 * dirty build still names the exact bytes that produced it. A checkout without
 * git fails instead of emitting an identity that matches anything.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_HASHED_BYTES = 2 * 1024 * 1024

export interface SourceIdentity {
  readonly sourceSha: string
  readonly sourceTree: string
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

export function readSourceIdentity(cwd: string): SourceIdentity {
  let sourceSha: string
  let headTree: string
  let diff: string
  try {
    sourceSha = git(cwd, ['rev-parse', 'HEAD']).trim()
    headTree = git(cwd, ['rev-parse', 'HEAD^{tree}']).trim()
    diff = git(cwd, ['diff', 'HEAD', '--binary'])
  } catch {
    throw new Error(`${cwd} has no usable git checkout; refusing to emit an unbound build identity`)
  }

  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((path) => path.length > 0)
    .toSorted()

  const hash = createHash('sha256')
  hash.update(headTree)
  hash.update('\0')
  hash.update(diff)
  for (const path of untracked) {
    hash.update('\0')
    hash.update(path)
    hash.update('\0')
    const full = join(cwd, path)
    const size = statSync(full).size
    if (size <= MAX_HASHED_BYTES) hash.update(readFileSync(full))
    else hash.update(String(size))
  }

  return { sourceSha, sourceTree: hash.digest('hex') }
}
