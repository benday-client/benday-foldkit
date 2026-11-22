// SPDX-License-Identifier: GPL-3.0-only

/**
 * Element-scoped deck geometry.
 *
 * Every helper takes the scroller element it should read or move; this module
 * owns no queries, classes or global listeners beyond the one returned cleanup.
 * Cards are recognised by their `data-deck-index` attribute.
 */

import type { DeckAxis } from './index.js'

function offsetOf(scroller: HTMLElement, axis: DeckAxis): number {
  return axis === 'x' ? scroller.scrollLeft : scroller.scrollTop
}

/** The scroller's client extent on `axis`, in px. */
function extentOf(scroller: HTMLElement, axis: DeckAxis): number {
  return axis === 'x' ? scroller.clientWidth : scroller.clientHeight
}

interface ScrollPadding {
  readonly start: number
  readonly end: number
}

/** The scroller's scroll padding on one axis, in px; `auto`/missing reads as 0. */
function scrollPadding(style: CSSStyleDeclaration, axis: DeckAxis): ScrollPadding {
  const rawStart = axis === 'x' ? style.scrollPaddingLeft : style.scrollPaddingTop
  const rawEnd = axis === 'x' ? style.scrollPaddingRight : style.scrollPaddingBottom
  const start = Number.parseFloat(rawStart)
  const end = Number.parseFloat(rawEnd)
  return {
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : 0,
  }
}

/**
 * The scroller's visible span on `axis`, in viewport coordinates, with its
 * scroll padding removed from the start and the extent.
 */
export function readSnapport(
  scroller: HTMLElement,
  axis: DeckAxis,
): { readonly start: number; readonly extent: number } {
  const rect = scroller.getBoundingClientRect()
  const padding = scrollPadding(getComputedStyle(scroller), axis)
  const viewportStart = axis === 'x' ? rect.left : rect.top
  const extent = extentOf(scroller, axis) - padding.start - padding.end
  return {
    start: viewportStart + padding.start,
    extent: extent > 0 ? extent : 0,
  }
}

/** The card's position in the scroller's content coordinates on `axis`. */
export function contentAnchor(card: Element, scroller: HTMLElement, axis: DeckAxis): number {
  const cardRect = card.getBoundingClientRect()
  const base = scroller.getBoundingClientRect()
  return axis === 'x'
    ? cardRect.left - base.left + scroller.scrollLeft
    : cardRect.top - base.top + scroller.scrollTop
}

/**
 * How much of the card would sit inside the snapport if the scroller rested at
 * `candidate`, as a fraction of the smaller of card and snapport. Rects are
 * shifted mathematically so the scroller never has to move transiently.
 */
export function visibleRatioAt(
  card: Element,
  scroller: HTMLElement,
  axis: DeckAxis,
  candidate: number,
): number {
  const cardRect = card.getBoundingClientRect()
  const base = scroller.getBoundingClientRect()
  const padding = scrollPadding(getComputedStyle(scroller), axis)
  const baseStart = axis === 'x' ? base.left : base.top
  const snapportStart = baseStart + padding.start
  const snapportExtent = Math.max(
    0,
    extentOf(scroller, axis) - padding.start - padding.end,
  )
  const cardExtent = axis === 'x' ? cardRect.width : cardRect.height
  const cardStart =
    (axis === 'x' ? cardRect.left : cardRect.top) - (candidate - offsetOf(scroller, axis))
  const overlap =
    Math.min(cardStart + cardExtent, snapportStart + snapportExtent) -
    Math.max(cardStart, snapportStart)
  const denominator = Math.min(cardExtent, snapportExtent)
  if (denominator <= 0) return 0
  return Math.max(0, overlap) / denominator
}

/**
 * The deck card nearest the snapport's centre on x, or its start on y.
 *
 * Cards carrying a malformed `data-deck-index` are not candidates; when no card
 * qualifies the result is null. Two cards at the same snap position are not
 * distinguishable, so the preferred index keeps its card.
 */
export function nearestCardIndex(
  scroller: HTMLElement,
  axis: DeckAxis,
  preferredIndex: number,
): number | null {
  const cards = scroller.querySelectorAll<HTMLElement>('[data-deck-index]')
  if (cards.length === 0) return null
  const base = scroller.getBoundingClientRect()
  const padding = scrollPadding(getComputedStyle(scroller), axis)
  const start = (axis === 'x' ? base.left : base.top) + padding.start
  const extent = Math.max(0, extentOf(scroller, axis) - padding.start - padding.end)
  const target = axis === 'x' ? start + extent / 2 : start
  let bestIndex: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const card of cards) {
    const raw = card.dataset['deckIndex']
    const index = raw === undefined ? Number.NaN : Number(raw)
    if (!Number.isInteger(index) || index < 0) continue
    const rect = card.getBoundingClientRect()
    const position = axis === 'x' ? rect.left + rect.width / 2 : rect.top
    const distance = Math.abs(position - target)
    // a tiled row can put two cards at the same snap position; keeping the
    // current one avoids flipping a restored card to its row neighbour
    const tiedPreferred = Math.abs(distance - bestDistance) <= 0.5 && index === preferredIndex
    if (distance < bestDistance - 0.5 || tiedPreferred) {
      bestIndex = index
      bestDistance = Math.min(bestDistance, distance)
    }
  }
  return bestIndex
}

/**
 * Scroll the card at `index` into its source alignment. A horizontal deck puts
 * the card's centre inline and keeps it near the block edge; a vertical deck
 * aligns the card to the start. Returns false without moving when the card is
 * absent (or the element cannot be scrolled).
 */
export function scrollDeckToIndex(
  scroller: HTMLElement,
  axis: DeckAxis,
  index: number,
  behavior: ScrollBehavior,
): boolean {
  const target = scroller.querySelector<HTMLElement>(`[data-deck-index="${index}"]`)
  if (target === null) return false
  if (typeof target.scrollIntoView !== 'function') return false
  target.scrollIntoView({
    block: axis === 'x' ? 'nearest' : 'start',
    inline: axis === 'x' ? 'center' : 'nearest',
    behavior,
  })
  return true
}

/** Scroll to a content offset on `axis`; negative offsets clamp to zero. */
export function scrollDeckToOffset(
  scroller: HTMLElement,
  axis: DeckAxis,
  offset: number,
  behavior: ScrollBehavior,
): void {
  const clamped = Math.max(0, offset)
  // jsdom has no Element.scrollTo; the offset itself is what matters there
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo(axis === 'x' ? { left: clamped, behavior } : { top: clamped, behavior })
    return
  }
  if (axis === 'x') scroller.scrollLeft = clamped
  else scroller.scrollTop = clamped
}

/**
 * Call `onRest` once each time the scroller comes to rest, ignoring the first
 * settle whose scroller/card geometry changed (a resize clamp is not reader
 * intent).
 *
 * Uses native `scrollend` when available and otherwise the source fallback: two
 * consecutive animation frames whose offset moved less than 0.5px. The returned
 * cleanup removes every listener and cancels any pending frame.
 */
export function watchDeckRest(
  scroller: HTMLElement,
  axis: DeckAxis,
  onRest: () => void,
): () => void {
  const geometryStamp = (): string => {
    const first = scroller.querySelector<HTMLElement>('[data-deck-index]')
    return [
      scroller.clientWidth,
      scroller.clientHeight,
      first?.offsetWidth ?? 0,
      first?.offsetHeight ?? 0,
    ].join(':')
  }
  let stamp = geometryStamp()
  const settle = (): void => {
    const current = geometryStamp()
    if (current !== stamp) {
      stamp = current
      return
    }
    onRest()
  }

  if ('onscrollend' in window) {
    scroller.addEventListener('scrollend', settle)
    return () => {
      scroller.removeEventListener('scrollend', settle)
    }
  }

  let raf = 0
  let last = offsetOf(scroller, axis)
  let stable = 0

  const loop = (): void => {
    const current = offsetOf(scroller, axis)
    if (Math.abs(current - last) < 0.5) stable += 1
    else {
      stable = 0
      last = current
    }
    // two identical offsets mean the scroller has stopped moving
    if (stable >= 2) {
      raf = 0
      settle()
      return
    }
    raf = requestAnimationFrame(loop)
  }

  const handleScroll = (): void => {
    if (raf !== 0) return
    stable = 0
    last = offsetOf(scroller, axis)
    raf = requestAnimationFrame(loop)
  }

  scroller.addEventListener('scroll', handleScroll, { passive: true })
  return () => {
    scroller.removeEventListener('scroll', handleScroll)
    if (raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}
