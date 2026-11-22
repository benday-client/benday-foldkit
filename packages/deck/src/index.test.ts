// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'
import {
  chooseRestoreMode,
  clampIndex,
  createDeckMemory,
  resolveIndex,
  type DeckPosition,
  type RestoreInput,
} from './index.js'

interface Item {
  readonly key: string
}

const getKey = (item: Item): string => item.key
const items = (...keys: string[]): readonly Item[] => keys.map((key) => ({ key }))

function position(overrides: Partial<DeckPosition>): DeckPosition {
  return {
    axis: 'y',
    index: 2,
    key: 'c',
    offset: 120,
    anchor: 300,
    ...overrides,
  }
}

function restoreInput(overrides: Partial<RestoreInput>): RestoreInput {
  return {
    saved: position({}),
    axis: 'y',
    resolvedIndex: 2,
    leadingPeek: false,
    anchorDelta: 0,
    visibleRatio: 0,
    ...overrides,
  }
}

describe('clampIndex', () => {
  it('keeps an in-range index', () => {
    expect(clampIndex(0, 5)).toBe(0)
    expect(clampIndex(3, 5)).toBe(3)
    expect(clampIndex(4, 5)).toBe(4)
  })

  it('clamps both ends', () => {
    expect(clampIndex(-1, 5)).toBe(0)
    expect(clampIndex(-40, 5)).toBe(0)
    expect(clampIndex(5, 5)).toBe(4)
    expect(clampIndex(99, 5)).toBe(4)
  })

  it('gives an empty deck its single zero slot', () => {
    expect(clampIndex(0, 0)).toBe(0)
    expect(clampIndex(7, 0)).toBe(0)
    expect(clampIndex(-7, 0)).toBe(0)
    expect(clampIndex(3, -2)).toBe(0)
  })
})

describe('resolveIndex', () => {
  it('is zero for an empty deck even with a saved key', () => {
    expect(resolveIndex({ index: 4, key: 'x' }, [], getKey)).toBe(0)
  })

  it('follows the saved key when it still exists', () => {
    expect(resolveIndex({ index: 0, key: 'c' }, items('a', 'b', 'c'), getKey)).toBe(2)
    expect(resolveIndex({ index: 2, key: 'a' }, items('a', 'b', 'c'), getKey)).toBe(0)
  })

  it('prefers the first of duplicated keys', () => {
    expect(resolveIndex({ index: 2, key: 'x' }, items('x', 'y', 'x'), getKey)).toBe(0)
  })

  it('falls back to the clamped index when the key left', () => {
    expect(resolveIndex({ index: 1, key: 'gone' }, items('a', 'b', 'c'), getKey)).toBe(1)
    expect(resolveIndex({ index: 9, key: 'gone' }, items('a', 'b'), getKey)).toBe(1)
    expect(resolveIndex({ index: -4, key: 'gone' }, items('a', 'b'), getKey)).toBe(0)
  })

  it('uses the index when no key is saved', () => {
    expect(resolveIndex({ index: 2, key: null }, items('a', 'b', 'c'), getKey)).toBe(2)
    expect(resolveIndex({ index: 3, key: null }, items('a', 'b', 'c'), getKey)).toBe(2)
  })
})

describe('chooseRestoreMode', () => {
  it('replays a vertical offset when the card barely moved', () => {
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 0 }))).toBe('offset')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 0.5 }))).toBe('offset')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 1 }))).toBe('offset')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: -1 }))).toBe('offset')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: -0.2 }))).toBe('offset')
  })

  it('replays a vertical offset when the card stays at least 90% visible', () => {
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 2, visibleRatio: 0.9 }))).toBe('offset')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: -2, visibleRatio: 0.95 }))).toBe('offset')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 40, visibleRatio: 1 }))).toBe('offset')
  })

  it('uses card geometry when the saved card drifted out of view', () => {
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 1.5, visibleRatio: 0.5 }))).toBe('card')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 2, visibleRatio: 0.899 }))).toBe('card')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: -2, visibleRatio: 0.5 }))).toBe('card')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: -40, visibleRatio: 0.5 }))).toBe('card')
  })

  it('rejects a non-finite saved offset and index', () => {
    expect(
      chooseRestoreMode(restoreInput({ anchorDelta: 0, saved: position({ offset: Number.NaN }) })),
    ).toBe('card')
    expect(clampIndex(Number.NaN, 5)).toBe(0)
    expect(clampIndex(Number.POSITIVE_INFINITY, 5)).toBe(0)
  })

  it('uses card geometry for unknown offsets or anchors', () => {
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 0, saved: position({ offset: null }) }))).toBe(
      'card',
    )
    expect(chooseRestoreMode(restoreInput({ anchorDelta: null, visibleRatio: 1 }))).toBe('card')
  })

  it('uses card geometry when the key moved the saved card', () => {
    expect(chooseRestoreMode(restoreInput({ resolvedIndex: 3 }))).toBe('card')
    expect(chooseRestoreMode(restoreInput({ resolvedIndex: 3, visibleRatio: 1 }))).toBe('card')
  })

  it('uses card geometry after an axis change', () => {
    expect(
      chooseRestoreMode(
        restoreInput({ saved: position({ axis: 'x' }), axis: 'y', anchorDelta: 0, visibleRatio: 1 }),
      ),
    ).toBe('card')
    expect(
      chooseRestoreMode(
        restoreInput({ saved: position({ axis: 'y' }), axis: 'x', anchorDelta: 0, visibleRatio: 1 }),
      ),
    ).toBe('card')
  })

  it('uses card geometry on the horizontal axis even for a matching offset', () => {
    expect(
      chooseRestoreMode(
        restoreInput({
          saved: position({ axis: 'x', offset: 400 }),
          axis: 'x',
          anchorDelta: 0,
          visibleRatio: 1,
        }),
      ),
    ).toBe('card')
  })

  it('treats non-finite geometry as card restoration', () => {
    expect(chooseRestoreMode(restoreInput({ anchorDelta: Number.NaN, visibleRatio: 1 }))).toBe('card')
    expect(chooseRestoreMode(restoreInput({ anchorDelta: 0, visibleRatio: Number.NaN }))).toBe(
      'offset',
    )
  })

  it('ignores the leading peek on the vertical axis, where it is not rendered', () => {
    expect(
      chooseRestoreMode(
        restoreInput({ leadingPeek: true, saved: position({ index: 0 }), resolvedIndex: 0 }),
      ),
    ).toBe('offset')
  })
})

describe('createDeckMemory', () => {
  it('reads back what it wrote and clears by key', () => {
    const memory = createDeckMemory()
    expect(memory.read('feed')).toBeUndefined()
    const saved = position({ key: 'first' })
    memory.write('feed', saved)
    expect(memory.read('feed')).toBe(saved)
    memory.write('feed', position({ key: 'second', index: 5 }))
    expect(memory.read('feed')?.key).toBe('second')
    memory.clear('feed')
    expect(memory.read('feed')).toBeUndefined()
    expect(memory.read('other')).toBeUndefined()
  })

  it('keeps separate instances isolated', () => {
    const first = createDeckMemory()
    const second = createDeckMemory()
    first.write('feed', position({ key: 'a' }))
    second.write('feed', position({ key: 'b' }))
    expect(first.read('feed')?.key).toBe('a')
    expect(second.read('feed')?.key).toBe('b')
    first.clear('feed')
    expect(first.read('feed')).toBeUndefined()
    expect(second.read('feed')?.key).toBe('b')
  })
})
