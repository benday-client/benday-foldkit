// SPDX-License-Identifier: GPL-3.0-only

/** What a stored draft actually says, and whether storage could be read at all. */
export interface DraftRead {
  text: string
  revision: string | null
  available: boolean
}

/** A write that storage accepted, with its revision (null for a deletion). */
export type DraftWrite = { ok: true; revision: string | null } | { ok: false }

/** The throwing synchronous key/value port the store is built on. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The caller-owned inputs: persistence, limit, clock and revision source. */
interface DraftStoreOptions {
  readonly storage: DraftStorage
  readonly storageKey: string
  readonly maxEntries: number
  readonly now: () => number
  readonly newRevision: () => string
}

export interface DraftStore {
  read(key: string): DraftRead
  write(key: string, text: string): DraftWrite
  clear(key: string, expectedRevision: string | null, expectedText: string): boolean
  purge(predicate: (key: string) => boolean): void
}

interface DraftRecord {
  text: string
  updatedAt: number
  revision?: string
}

type DraftMap = Record<string, DraftRecord>

// a stored entry is only trusted when every field a draft needs is intact;
// arrays and junk values are dropped before they can reach an eviction count
function isDraftRecord(value: unknown): value is DraftRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const text: unknown = Reflect.get(value, 'text')
  const updatedAt: unknown = Reflect.get(value, 'updatedAt')
  const revision: unknown = Reflect.get(value, 'revision')
  if (typeof text !== 'string') return false
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return false
  if (revision !== undefined && typeof revision !== 'string') return false
  return true
}

export function createDraftStore(options: DraftStoreOptions): DraftStore {
  const { storage, storageKey, maxEntries, now, newRevision } = options

  /**
   * The stored map, or null when storage itself cannot be read. A malformed
   * json body or a wrong top-level shape is an available empty map: there are
   * no readable entries to preserve, and a following write must not be
   * blocked by them. Null is reserved for an inaccessible store, because
   * treating that as empty would let a save erase every other account's draft.
   */
  function readMap(): DraftMap | null {
    let raw: string | null
    try {
      raw = storage.getItem(storageKey)
    } catch {
      return null
    }
    if (raw === null) return {}

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {}
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    const drafts: DraftMap = {}
    for (const key of Object.keys(parsed)) {
      const value: unknown = Reflect.get(parsed, key)
      if (isDraftRecord(value)) drafts[key] = value
    }
    return drafts
  }

  function writeMap(drafts: DraftMap): boolean {
    try {
      storage.setItem(storageKey, JSON.stringify(drafts))
      return true
    } catch {
      return false
    }
  }

  function evictOldest(drafts: DraftMap): void {
    const entries = Object.entries(drafts)
    if (entries.length <= maxEntries) return
    entries.sort((left, right) => left[1].updatedAt - right[1].updatedAt)
    for (const [oldKey] of entries.slice(0, entries.length - maxEntries)) {
      delete drafts[oldKey]
    }
  }

  /** Reads one entry, reporting an unreadable store instead of pretending it is empty. */
  function read(key: string): DraftRead {
    const drafts = readMap()
    if (drafts === null) return { text: '', revision: null, available: false }

    const record = drafts[key]
    if (record === undefined) return { text: '', revision: null, available: true }
    // a legacy entry has no revision; null reports that
    return { text: record.text, revision: record.revision ?? null, available: true }
  }

  /**
   * Writes nonempty text under a caller-supplied fresh revision. Empty text
   * deletes the entry. A deletion of an already absent entry is accepted
   * without storage access beyond the read, and a failed read or write is
   * reported rather than hidden.
   */
  function write(key: string, text: string): DraftWrite {
    const drafts = readMap()
    if (drafts === null) return { ok: false }

    if (text.trim().length === 0) {
      if (!(key in drafts)) return { ok: true, revision: null }
      delete drafts[key]
      return writeMap(drafts) ? { ok: true, revision: null } : { ok: false }
    }

    const revision = newRevision()
    drafts[key] = { text, updatedAt: now(), revision }
    evictOldest(drafts)
    return writeMap(drafts) ? { ok: true, revision } : { ok: false }
  }

  /**
   * Removes the draft only when it is still the exact record this composition
   * wrote. An absent, newer or nonmatching entry has nothing left to clear, so
   * it counts as a success; false means storage could not be read or written.
   */
  function clear(
    key: string,
    expectedRevision: string | null,
    expectedText: string,
  ): boolean {
    const drafts = readMap()
    if (drafts === null) return false

    const current = drafts[key]
    if (current === undefined) return true
    if ((current.revision ?? null) !== expectedRevision || current.text !== expectedText) {
      return true
    }

    delete drafts[key]
    return writeMap(drafts)
  }

  /**
   * Removes every entry whose key matches the caller's predicate in a single
   * rewrite and leaves the rest alone. An unreadable store is left untouched
   * rather than rewritten, and nothing is written when nothing matches.
   */
  function purge(predicate: (key: string) => boolean): void {
    const drafts = readMap()
    if (drafts === null) return

    let changed = false
    for (const key of Object.keys(drafts)) {
      if (predicate(key)) {
        delete drafts[key]
        changed = true
      }
    }
    if (!changed) return
    writeMap(drafts)
  }

  return { read, write, clear, purge }
}
