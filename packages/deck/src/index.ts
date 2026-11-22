// SPDX-License-Identifier: GPL-3.0-only

/**
 * Pure deck selection and position arithmetic.
 *
 * The browser geometry lives in `./browser.ts`; nothing here touches the DOM,
 * storage or application state. A deck's axis, item keys and scroll offsets are
 * supplied by the owning application.
 */

/** The scroll axis a deck lays out on: horizontal on wide decks, otherwise vertical. */
export type DeckAxis = 'x' | 'y'

/** A committed selection: the live item index and the key that has to keep it current. */
export interface DeckSelection {
  readonly index: number
  /** The focused item's key; an index alone drifts when items shift. */
  readonly key: string | null
}

/**
 * One settled deck position, in the frame the browser helpers read.
 *
 * `offset` is the settled scroll offset on `axis` (null while a smooth move is
 * in flight) and `anchor` is the selected card's content-axis position (null
 * while in flight, or when the card is absent).
 */
export interface DeckPosition {
  readonly axis: DeckAxis
  readonly index: number
  /** The focused card's key. */
  readonly key: string | null
  readonly offset: number | null
  readonly anchor: number | null
}

/** Everything needed to decide whether a saved offset still describes the live deck. */
export interface RestoreInput {
  readonly saved: DeckPosition
  readonly axis: DeckAxis
  readonly resolvedIndex: number
  /**
   * Whether the current layout renders the extra leading card slot. A leading
   * peek only exists on the horizontal axis, where card geometry always wins,
   * so the decision below needs no separate branch for it.
   */
  readonly leadingPeek: boolean
  /**
   * `contentAnchor(card) - saved.anchor` for the resolved card, or null when the
   * card or the saved anchor is unknown.
   */
  readonly anchorDelta: number | null
  /** The resolved card's visible fraction at the saved offset. */
  readonly visibleRatio: number
}

/**
 * Clamp an index into `[0, length - 1]`; an empty deck has exactly one slot, 0.
 */
export function clampIndex(index: number, length: number): number {
  if (length <= 0 || !Number.isFinite(index)) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

/**
 * The live index for a committed selection: a key that still exists wins over a
 * stale index, so cards inserted or removed around it keep it current. A card
 * that left the deck falls back to the clamped saved index.
 */
export function resolveIndex<T>(
  selection: DeckSelection,
  items: readonly T[],
  getKey: (item: T) => string,
): number {
  if (items.length === 0) return 0
  if (selection.key !== null) {
    const keyed = items.findIndex((item) => getKey(item) === selection.key)
    if (keyed >= 0) return keyed
  }
  return clampIndex(selection.index, items.length)
}

/**
 * Whether a saved position can be replayed as a scroll offset or must instead
 * be restored from card geometry.
 *
 * An offset is only meaningful on the same vertical axis, for the same card,
 * with a known saved offset and anchor, and when the card has not moved more
 * than one pixel or is still at least 90% visible at the saved offset. Every
 * other case -- a changed axis, horizontal layout, a card moved by a key, an
 * in-flight position -- is restored by centring/scrolling the card itself.
 */
export function chooseRestoreMode(input: RestoreInput): 'offset' | 'card' {
  const { saved, axis, resolvedIndex, anchorDelta, visibleRatio } = input
  if (saved.axis !== axis) return 'card'
  if (axis === 'x') return 'card'
  if (saved.offset === null || anchorDelta === null) return 'card'
  if (!Number.isFinite(saved.offset)) return 'card'
  if (resolvedIndex !== saved.index) return 'card'
  // an unmeasurable anchor is not evidence that the card stayed put
  if (!Number.isFinite(anchorDelta)) return 'card'
  if (Math.abs(anchorDelta) <= 1) return 'offset'
  if (visibleRatio >= 0.9) return 'offset'
  return 'card'
}

/** App-lifetime, per-instance deck position memory. Never backed by storage. */
export interface DeckMemory {
  read(key: string): DeckPosition | undefined
  write(key: string, position: DeckPosition): void
  clear(key: string): void
}

/** Create an independent in-memory position store; the owner decides when it is dropped. */
export function createDeckMemory(): DeckMemory {
  const positions = new Map<string, DeckPosition>()
  return {
    read(key) {
      return positions.get(key)
    },
    write(key, position) {
      positions.set(key, position)
    },
    clear(key) {
      positions.delete(key)
    },
  }
}
