// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { ActionEntries, ActionEntry, PostCountSnapshot, ViewerState } from './interactions.js'
import {
  applyViewerRead,
  displayedCount,
  rebaseCount,
  reconcileSide,
  retireCounts,
  UNCONFIRMED_STATE,
  VIEWER_STALE_TIME,
  WRITE_CONFIRMATION_TIME,
} from './interactions.js'

const URI = 'at://did:plc:test/app.bsky.feed.post/1'
const OTHER = 'at://did:plc:test/app.bsky.feed.post/2'
const NOW = 1_000_000

function entry(overrides: Partial<ActionEntry> = {}): ActionEntry {
  return {
    likeUri: null,
    repostUri: null,
    likeDelta: 0,
    repostDelta: 0,
    likeBaseCount: null,
    repostBaseCount: null,
    pending: null,
    error: null,
    likeCheckedAt: null,
    repostCheckedAt: null,
    likeWrittenAt: null,
    repostWrittenAt: null,
    ...overrides,
  }
}

function viewer(overrides: Partial<ViewerState> = {}): ViewerState {
  return {
    likeUri: null,
    repostUri: null,
    likeCount: 0,
    repostCount: 0,
    ...overrides,
  }
}

function snapshot(uri: string, likeCount: number, repostCount: number): PostCountSnapshot {
  return { uri, likeCount, repostCount }
}

describe('interaction constants', () => {
  it('keeps the source freshness and write-confirmation windows', () => {
    expect(VIEWER_STALE_TIME).toBe(45_000)
    expect(WRITE_CONFIRMATION_TIME).toBe(45_000)
  })

  it('keeps the exact unconfirmed-state message', () => {
    expect(UNCONFIRMED_STATE).toBe('could not confirm the current interaction state')
  })
})

describe('displayedCount', () => {
  it('passes the canonical count through when the toggle has no base', () => {
    expect(displayedCount(2, null, 1)).toBe(2)
  })

  it('passes a refreshed count through once it no longer matches the base', () => {
    expect(displayedCount(5, 2, 1)).toBe(5)
    expect(displayedCount(2, 2, 1)).toBe(3)
  })

  it('applies the delta to a still-current base', () => {
    expect(displayedCount(2, 2, 1)).toBe(3)
    expect(displayedCount(2, 2, -1)).toBe(1)
  })

  it('never displays a negative count', () => {
    expect(displayedCount(0, 0, -1)).toBe(0)
    expect(displayedCount(1, 1, -3)).toBe(0)
  })
})

describe('rebaseCount', () => {
  it('keeps the delta while the count still matches its base', () => {
    expect(rebaseCount(2, 1, 2)).toEqual({ base: 2, delta: 1 })
  })

  it('rebases onto a refreshed count and drops the stale delta', () => {
    expect(rebaseCount(2, 1, 5)).toEqual({ base: 5, delta: 0 })
  })

  it('starts from the current count when no base exists', () => {
    expect(rebaseCount(null, 3, 5)).toEqual({ base: 5, delta: 0 })
  })
})

describe('reconcileSide', () => {
  it('acknowledges canonical state that already matches the local uri', () => {
    const current = entry({ likeUri: 'at://like/local', likeWrittenAt: NOW })

    expect(reconcileSide(current, 'like', 'at://like/local', NOW + 1000)).toEqual({
      likeCheckedAt: NOW + 1000,
      likeWrittenAt: null,
    })
  })

  it('keeps a local write winning until its confirmation deadline', () => {
    const current = entry({ likeUri: 'at://like/local', likeWrittenAt: NOW })

    expect(reconcileSide(current, 'like', null, NOW + WRITE_CONFIRMATION_TIME - 1)).toEqual({})
    expect(reconcileSide(current, 'like', null, NOW + WRITE_CONFIRMATION_TIME)).toEqual({
      likeUri: null,
      likeDelta: 0,
      likeBaseCount: null,
      likeCheckedAt: NOW + WRITE_CONFIRMATION_TIME,
      likeWrittenAt: null,
    })
  })

  it('adopts a contradicting canonical uri outside the write window', () => {
    const current = entry({
      likeUri: 'at://like/old',
      likeDelta: 1,
      likeBaseCount: 4,
      likeCheckedAt: NOW - VIEWER_STALE_TIME,
    })

    expect(reconcileSide(current, 'like', null, NOW)).toEqual({
      likeUri: null,
      likeDelta: 0,
      likeBaseCount: null,
      likeCheckedAt: NOW,
      likeWrittenAt: null,
    })
  })

  it('reconciles the repost side independently', () => {
    const current = entry({
      likeUri: 'at://like/local',
      likeDelta: 1,
      likeBaseCount: 2,
      repostUri: 'at://repost/old',
      repostDelta: 2,
      repostBaseCount: 7,
      repostWrittenAt: NOW,
    })

    expect(reconcileSide(current, 'repost', null, NOW + 1000)).toEqual({})
    expect(reconcileSide(current, 'like', 'at://like/elsewhere', NOW + 1000)).toEqual({
      likeUri: 'at://like/elsewhere',
      likeDelta: 0,
      likeBaseCount: null,
      likeCheckedAt: NOW + 1000,
      likeWrittenAt: null,
    })
    expect(reconcileSide(current, 'repost', 'at://repost/new', NOW + WRITE_CONFIRMATION_TIME)).toEqual(
      {
        repostUri: 'at://repost/new',
        repostDelta: 0,
        repostBaseCount: null,
        repostCheckedAt: NOW + WRITE_CONFIRMATION_TIME,
        repostWrittenAt: null,
      },
    )
  })
})

describe('applyViewerRead', () => {
  it('adopts both canonical sides and resets their deltas and bases', () => {
    const current = entry({
      likeUri: 'at://like/old',
      likeDelta: 2,
      likeBaseCount: 5,
      repostUri: null,
      repostCheckedAt: NOW - VIEWER_STALE_TIME,
    })
    const byUri: ActionEntries = { [URI]: current }
    const captured: Readonly<Record<string, ActionEntry | undefined>> = { [URI]: current }

    const next = applyViewerRead(
      byUri,
      captured,
      new Map([[URI, viewer({ likeUri: 'at://like/new', repostUri: 'at://repost/new' })]]),
      NOW,
    )

    expect(next).toEqual({
      [URI]: entry({
        likeUri: 'at://like/new',
        likeCheckedAt: NOW,
        repostUri: 'at://repost/new',
        repostCheckedAt: NOW,
      }),
    })
    // the adoption is a new value, not a mutation of the captured entry
    expect(current.likeUri).toBe('at://like/old')
  })

  it('keeps a local write protected while adopting the other side', () => {
    const current = entry({
      likeUri: 'at://like/local',
      likeWrittenAt: NOW,
      repostUri: 'at://repost/old',
      repostDelta: 1,
      repostBaseCount: 3,
    })
    const byUri: ActionEntries = { [URI]: current }

    const next = applyViewerRead(
      byUri,
      { [URI]: current },
      new Map([[URI, viewer({ likeUri: null, repostUri: 'at://repost/new' })]]),
      NOW + 1000,
    )

    expect(next).toEqual({
      [URI]: entry({
        likeUri: 'at://like/local',
        likeWrittenAt: NOW,
        repostUri: 'at://repost/new',
        repostDelta: 0,
        repostBaseCount: null,
        repostCheckedAt: NOW + 1000,
      }),
    })
  })

  it('drops the write protection once the canonical uri catches up', () => {
    const current = entry({
      likeUri: 'at://like/local',
      likeDelta: 1,
      likeBaseCount: 2,
      likeWrittenAt: NOW,
    })
    const byUri: ActionEntries = { [URI]: current }

    const next = applyViewerRead(
      byUri,
      { [URI]: current },
      new Map([[URI, viewer({ likeUri: 'at://like/local' })]]),
      NOW + 1000,
    )

    expect(next).toEqual({
      [URI]: entry({
        likeUri: 'at://like/local',
        likeDelta: 1,
        likeBaseCount: 2,
        likeCheckedAt: NOW + 1000,
        repostCheckedAt: NOW + 1000,
      }),
    })
  })

  it('lets an entry that was absent at read start consume the read', () => {
    const next = applyViewerRead(
      {},
      {},
      new Map([[URI, viewer({ likeUri: 'at://like/external' })]]),
      NOW,
    )

    expect(next).toEqual({
      [URI]: entry({
        likeUri: 'at://like/external',
        likeCheckedAt: NOW,
        repostCheckedAt: NOW,
      }),
    })
  })

  it('ignores a read whose entry was replaced by a newer local action', () => {
    const capturedEntry = entry({ likeCheckedAt: NOW - VIEWER_STALE_TIME })
    const newer = entry({
      likeUri: 'at://like/mine',
      likeDelta: 1,
      likeBaseCount: 2,
      likeCheckedAt: NOW,
    })
    const byUri: ActionEntries = { [URI]: newer }

    const next = applyViewerRead(
      byUri,
      { [URI]: capturedEntry },
      new Map([[URI, viewer()]]),
      NOW + 500,
    )

    expect(next).toBe(byUri)
    expect(next[URI]).toBe(newer)
  })

  it('ignores a read for an entry that appeared after the read started', () => {
    const newer = entry({ likeUri: 'at://like/mine', likeDelta: 1, likeBaseCount: 2 })
    const byUri: ActionEntries = { [URI]: newer }

    const next = applyViewerRead(byUri, {}, new Map([[URI, viewer()]]), NOW)

    expect(next).toBe(byUri)
  })

  it('returns the input record when the read confirms nothing', () => {
    const current = entry({ likeUri: 'at://like/local', likeCheckedAt: NOW })
    const byUri: ActionEntries = { [URI]: current }

    const next = applyViewerRead(byUri, { [URI]: current }, new Map(), NOW + 1000)

    expect(next).toBe(byUri)
  })

  it('returns the input record when every side is still write-protected', () => {
    const current = entry({
      likeUri: 'at://like/local',
      likeWrittenAt: NOW,
      repostUri: 'at://repost/local',
      repostWrittenAt: NOW,
    })
    const byUri: ActionEntries = { [URI]: current }

    const next = applyViewerRead(
      byUri,
      { [URI]: current },
      new Map([[URI, viewer({ likeUri: null, repostUri: null })]]),
      NOW + 1000,
    )

    expect(next).toBe(byUri)
  })

  it('preserves the identity of untouched entries', () => {
    const first = entry({ likeUri: 'at://like/old' })
    const second = entry({ likeUri: 'at://like/other' })
    const byUri: ActionEntries = { [URI]: first, [OTHER]: second }

    const next = applyViewerRead(
      byUri,
      { [URI]: first, [OTHER]: second },
      new Map([[URI, viewer({ likeUri: 'at://like/new' })]]),
      NOW,
    )

    expect(next).not.toBe(byUri)
    expect(next[URI]).not.toBe(first)
    expect(next[URI]?.likeUri).toBe('at://like/new')
    expect(next[OTHER]).toBe(second)
  })
})

describe('retireCounts', () => {
  it('leaves a delta alone while the snapshot still carries its base', () => {
    const current = entry({ likeBaseCount: 2, likeDelta: 1, repostBaseCount: 1, repostDelta: 1 })
    const byUri: ActionEntries = { [URI]: current }

    expect(retireCounts(byUri, [snapshot(URI, 2, 1)])).toBe(byUri)
  })

  it('retires a delta once a newer snapshot supersedes its base', () => {
    const current = entry({ likeBaseCount: 2, likeDelta: 1, repostBaseCount: 1, repostDelta: 1 })
    const byUri: ActionEntries = { [URI]: current }

    const next = retireCounts(byUri, [snapshot(URI, 5, 1)])

    expect(next[URI]).toEqual(
      entry({ likeBaseCount: null, likeDelta: 0, repostBaseCount: 1, repostDelta: 1 }),
    )
  })

  it('retires both sides independently', () => {
    const current = entry({ likeBaseCount: 2, likeDelta: 1, repostBaseCount: 1, repostDelta: 1 })
    const byUri: ActionEntries = { [URI]: current }

    const next = retireCounts(byUri, [snapshot(URI, 5, 4)])

    expect(next[URI]).toEqual(entry({ likeBaseCount: null, likeDelta: 0 }))
  })

  it('does not retire a base without a delta', () => {
    const current = entry({ likeBaseCount: 2, repostBaseCount: 1 })
    const byUri: ActionEntries = { [URI]: current }

    expect(retireCounts(byUri, [snapshot(URI, 5, 4)])).toBe(byUri)
  })

  it('ignores entries that carry no stored base', () => {
    const current = entry({ likeDelta: 1, repostDelta: 1 })
    const byUri: ActionEntries = { [URI]: current }

    expect(retireCounts(byUri, [snapshot(URI, 5, 4)])).toBe(byUri)
  })

  it('ignores snapshots for uris without an entry', () => {
    const byUri: ActionEntries = { [URI]: entry({ likeBaseCount: 2, likeDelta: 1 }) }

    expect(retireCounts(byUri, [snapshot(OTHER, 5, 4)])).toBe(byUri)
  })

  it('preserves the identity of untouched entries', () => {
    const first = entry({ likeBaseCount: 2, likeDelta: 1 })
    const second = entry({ likeBaseCount: 3, likeDelta: 1 })
    const byUri: ActionEntries = { [URI]: first, [OTHER]: second }

    const next = retireCounts(byUri, [snapshot(URI, 5, 1)])

    expect(next).not.toBe(byUri)
    expect(next[URI]?.likeBaseCount).toBeNull()
    expect(next[OTHER]).toBe(second)
  })

  it('does not revive a retired delta when an older base reappears', () => {
    const current = entry({ likeBaseCount: 2, likeDelta: 1, repostBaseCount: 1 })
    const retired = retireCounts({ [URI]: current }, [snapshot(URI, 5, 1)])

    expect(retireCounts(retired, [snapshot(URI, 2, 1)])).toBe(retired)

    const retiredEntry = retired[URI]
    expect(
      displayedCount(2, retiredEntry?.likeBaseCount ?? null, retiredEntry?.likeDelta ?? 0),
    ).toBe(2)
  })
})
