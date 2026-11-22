// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'
import {
  createDraftStore,
  type DraftRead,
  type DraftStorage,
  type DraftStore,
  type DraftWrite,
} from './index.js'

const STORAGE_KEY = 'test:drafts'

/** A synchronous storage double that records every key it is asked to read or write. */
class MemoryStorage implements DraftStorage {
  readonly values = new Map<string, string>()
  readonly reads: string[] = []
  readonly writes: Array<{ readonly key: string; readonly value: string }> = []
  failRead = false
  failWrite = false

  getItem(key: string): string | null {
    this.reads.push(key)
    if (this.failRead) throw new Error('storage read denied')
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes.push({ key, value })
    if (this.failWrite) throw new Error('storage write denied')
    this.values.set(key, value)
  }
}

interface Harness {
  readonly storage: MemoryStorage
  readonly store: DraftStore
  readonly revisions: string[]
  setNow(value: number): void
  setNextRevision(value: string): void
}

function makeHarness(maxEntries = 20): Harness {
  const storage = new MemoryStorage()
  let clock = 100
  let nextRevision = 'revision-1'
  const revisions: string[] = []
  const store = createDraftStore({
    storage,
    storageKey: STORAGE_KEY,
    maxEntries,
    now: () => clock,
    newRevision: () => {
      revisions.push(nextRevision)
      return nextRevision
    },
  })
  return {
    storage,
    store,
    revisions,
    setNow(value: number): void {
      clock = value
    },
    setNextRevision(value: string): void {
      nextRevision = value
    },
  }
}

function seed(storage: MemoryStorage, value: unknown): void {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('fixture is not serializable')
  storage.values.set(STORAGE_KEY, encoded)
}

function storedKeys(storage: MemoryStorage): readonly string[] {
  const raw = storage.values.get(STORAGE_KEY)
  if (raw === undefined) return []
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('stored drafts are not an object')
  }
  return Object.keys(parsed)
}

describe('createDraftStore', () => {
  it('reads an absent key as an available empty draft', () => {
    const harness = makeHarness()

    const absent: DraftRead = harness.store.read('post')

    expect(absent).toEqual({ text: '', revision: null, available: true })
    expect(harness.storage.reads).toEqual([STORAGE_KEY])
    expect(harness.storage.writes).toEqual([])
  })

  it('writes the caller clock and revision and reads them back', () => {
    const harness = makeHarness()
    harness.setNow(1234)
    harness.setNextRevision('revision-a')

    const written: DraftWrite = harness.store.write('post', 'hello')

    expect(written).toEqual({ ok: true, revision: 'revision-a' })
    expect(harness.storage.values.get(STORAGE_KEY)).toBe(
      '{"post":{"text":"hello","updatedAt":1234,"revision":"revision-a"}}',
    )
    expect(harness.store.read('post')).toEqual({
      text: 'hello',
      revision: 'revision-a',
      available: true,
    })
    expect(harness.revisions).toEqual(['revision-a'])
    expect(harness.storage.writes.map((write) => write.key)).toEqual([STORAGE_KEY])
  })

  it('deletes on blank text and reports a deletion revision as null', () => {
    const harness = makeHarness()
    harness.store.write('post', 'hello')
    const writesBeforeDelete = harness.storage.writes.length

    expect(harness.store.write('post', '   ')).toEqual({ ok: true, revision: null })
    expect(harness.store.read('post')).toEqual({ text: '', revision: null, available: true })
    expect(storedKeys(harness.storage)).not.toContain('post')
    expect(harness.storage.writes).toHaveLength(writesBeforeDelete + 1)
    expect(harness.revisions).toHaveLength(1)

    // deleting an entry that is not there has nothing to fail about
    expect(harness.store.write('missing', '')).toEqual({ ok: true, revision: null })
    expect(harness.storage.writes).toHaveLength(writesBeforeDelete + 1)
  })

  it('drops malformed entries before eviction and keeps the newest drafts', () => {
    const harness = makeHarness()
    const mixed: Record<string, unknown> = {
      'kept-legacy': { text: 'legacy record', updatedAt: 1 },
      'null-entry': null,
      'array-entry': ['text'],
      'string-entry': 'text',
      'missing-date': { text: 'no date' },
      'bad-date': { text: 'bad date', updatedAt: 'yesterday' },
      'bad-revision': { text: 'bad revision', updatedAt: 2, revision: 7 },
    }
    for (let index = 0; index < 22; index += 1) {
      mixed[`draft-${index}`] = { text: `text-${index}`, updatedAt: 100 + index }
    }
    seed(harness.storage, mixed)
    harness.setNow(1000)
    harness.setNextRevision('revision-new')

    expect(harness.store.write('draft-22', 'text-22')).toEqual({
      ok: true,
      revision: 'revision-new',
    })

    const kept = storedKeys(harness.storage)
    expect(kept).toHaveLength(20)
    expect(kept).not.toContain('kept-legacy')
    expect(kept).not.toContain('draft-0')
    expect(kept).not.toContain('draft-1')
    expect(kept).not.toContain('draft-2')
    expect(kept).toContain('draft-3')
    expect(kept).toContain('draft-22')
    expect(kept).not.toContain('null-entry')
    expect(kept).not.toContain('array-entry')
    expect(kept).not.toContain('missing-date')
    expect(kept).not.toContain('bad-date')
    expect(kept).not.toContain('bad-revision')
    expect(harness.store.read('draft-3').text).toBe('text-3')
    expect(harness.store.read('draft-22').text).toBe('text-22')
  })

  it('respects a caller-configured entry limit', () => {
    const harness = makeHarness(2)
    harness.setNow(1)
    harness.setNextRevision('rev-1')
    harness.store.write('first', 'one')
    harness.setNow(2)
    harness.setNextRevision('rev-2')
    harness.store.write('second', 'two')
    harness.setNow(3)
    harness.setNextRevision('rev-3')
    harness.store.write('third', 'three')

    expect(storedKeys(harness.storage)).toEqual(['second', 'third'])
    expect(harness.store.read('first').text).toBe('')
  })

  it('normalizes a legacy record without a revision to null', () => {
    const harness = makeHarness()
    seed(harness.storage, { post: { text: 'legacy draft', updatedAt: 1 } })

    expect(harness.store.read('post')).toEqual({
      text: 'legacy draft',
      revision: null,
      available: true,
    })
    expect(harness.store.clear('post', null, 'legacy draft')).toBe(true)
    expect(harness.store.read('post').text).toBe('')
  })

  it('clears only the exact revision and text it wrote', () => {
    const harness = makeHarness()
    harness.setNextRevision('revision-a')
    harness.store.write('post', 'hello')

    // a mismatched body or revision leaves the newer record alone, and counts
    // as nothing left to clear
    expect(harness.store.clear('post', 'revision-a', 'different text')).toBe(true)
    expect(harness.store.read('post').text).toBe('hello')

    expect(harness.store.clear('post', 'f'.repeat(32), 'hello')).toBe(true)
    expect(harness.store.read('post').text).toBe('hello')

    harness.setNextRevision('revision-b')
    harness.store.write('post', 'newer draft')
    expect(harness.store.clear('post', 'revision-a', 'hello')).toBe(true)
    expect(harness.store.read('post').text).toBe('newer draft')

    expect(harness.store.clear('post', 'revision-b', 'newer draft')).toBe(true)
    expect(harness.store.read('post').text).toBe('')
    // an absent record is already clear
    expect(harness.store.clear('post', null, 'anything')).toBe(true)
  })

  it('treats malformed json as available empty and replaces it on write', () => {
    const harness = makeHarness()
    harness.storage.values.set(STORAGE_KEY, '{not json')

    expect(harness.store.read('post')).toEqual({ text: '', revision: null, available: true })
    expect(harness.store.write('post', 'fresh')).toEqual({
      ok: true,
      revision: 'revision-1',
    })
    expect(harness.store.read('post').text).toBe('fresh')
    expect(storedKeys(harness.storage)).toEqual(['post'])
  })

  it('treats a wrong top-level shape as available empty', () => {
    const harness = makeHarness()
    seed(harness.storage, [{ text: 'nope', updatedAt: 1 }])

    expect(harness.store.read('0')).toEqual({ text: '', revision: null, available: true })
    expect(harness.store.write('post', 'again')).toEqual({ ok: true, revision: 'revision-1' })
    expect(harness.store.read('post').text).toBe('again')
    expect(storedKeys(harness.storage)).toEqual(['post'])
  })

  it('reports an unreadable store and never writes on a denied read', () => {
    const harness = makeHarness()
    harness.storage.failRead = true

    expect(harness.store.read('post')).toEqual({ text: '', revision: null, available: false })
    expect(harness.store.write('post', 'hello')).toEqual({ ok: false })
    expect(harness.store.clear('post', null, 'hello')).toBe(false)
    harness.store.purge(() => true)
    // a write must never replace every other account's drafts with an empty map
    expect(harness.storage.writes).toEqual([])
  })

  it('reports a write the store rejects and leaves the previous record intact', () => {
    const harness = makeHarness()
    harness.store.write('post', 'kept')
    harness.storage.failWrite = true

    expect(harness.store.write('post', 'replacement')).toEqual({ ok: false })
    expect(harness.store.write('other', '')).toEqual({ ok: true, revision: null })

    harness.storage.failWrite = false
    expect(harness.store.read('post').text).toBe('kept')
  })

  it('reports a deletion the store rejects', () => {
    const harness = makeHarness()
    harness.setNextRevision('revision-a')
    harness.store.write('post', 'hello')
    harness.storage.failWrite = true

    expect(harness.store.clear('post', 'revision-a', 'hello')).toBe(false)
    harness.storage.failWrite = false
    expect(harness.store.read('post').text).toBe('hello')
  })
})

describe('DraftStore.purge', () => {
  it('removes only matching keys in one rewrite and keeps the rest', () => {
    const harness = makeHarness()
    seed(harness.storage, {
      'retired:post': { text: 'old post', updatedAt: 1 },
      'retired:reply:at://post/b': { text: 'old reply', updatedAt: 2 },
      'kept:post': { text: 'post', updatedAt: 3 },
      'kept:reply:at://post/a': { text: 'reply', updatedAt: 4 },
      'unknown-key': { text: 'unknown', updatedAt: 6 },
    })

    harness.store.purge((key) => key.startsWith('retired:'))

    // the map is rewritten once for the whole purge, not once per removed key
    expect(harness.storage.writes).toHaveLength(1)
    expect(harness.storage.writes[0]?.key).toBe(STORAGE_KEY)
    expect(storedKeys(harness.storage)).toEqual([
      'kept:post',
      'kept:reply:at://post/a',
      'unknown-key',
    ])
    expect(harness.store.read('kept:post').text).toBe('post')
    expect(harness.store.read('kept:reply:at://post/a').text).toBe('reply')
    expect(harness.store.read('unknown-key').text).toBe('unknown')
    expect(harness.store.read('retired:post').text).toBe('')
  })

  it('writes nothing when no key matches', () => {
    const harness = makeHarness()
    harness.store.write('kept:post', 'post')
    const writesBeforePurge = harness.storage.writes.length

    harness.store.purge((key) => key.startsWith('retired:'))

    expect(harness.storage.writes).toHaveLength(writesBeforePurge)
    expect(harness.store.read('kept:post').text).toBe('post')
  })

  it('leaves an unreadable store untouched', () => {
    const harness = makeHarness()
    const raw = JSON.stringify({ 'retired:post': { text: 'kept', updatedAt: 1 } })
    harness.storage.values.set(STORAGE_KEY, raw)
    harness.storage.failRead = true

    harness.store.purge(() => true)

    expect(harness.storage.writes).toEqual([])
    expect(harness.storage.values.get(STORAGE_KEY)).toBe(raw)
  })
})
