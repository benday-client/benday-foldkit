// SPDX-License-Identifier: GPL-3.0-only
import type { PostModel } from './model.js'

export type ActionPending = 'like' | 'unlike' | 'repost' | 'unrepost'

export interface ActionEntry {
  readonly likeUri: string | null
  readonly repostUri: string | null
  readonly likeDelta: number
  readonly repostDelta: number
  readonly likeBaseCount: number | null
  readonly repostBaseCount: number | null
  readonly pending: ActionPending | null
  readonly error: string | null
  /** when each side was last confirmed, by a canonical read or a local write */
  readonly likeCheckedAt: number | null
  readonly repostCheckedAt: number | null
  /** when this tab last wrote each side; canonical state may lag until then */
  readonly likeWrittenAt: number | null
  readonly repostWrittenAt: number | null
}

export interface ViewerState {
  readonly likeUri: string | null
  readonly repostUri: string | null
}

export type ActionEntries = Readonly<Record<string, ActionEntry>>

/** the canonical counts a currently loaded card carries */
export type PostCountSnapshot = Pick<PostModel, 'uri' | 'likeCount' | 'repostCount'>

export const VIEWER_STALE_TIME = 45_000
export const WRITE_CONFIRMATION_TIME = 45_000
export const UNCONFIRMED_STATE = 'could not confirm the current interaction state'

const EMPTY_ENTRY: ActionEntry = {
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
}

/**
 * Optimistic counts are relative to the post count the toggle was based on.
 * A refreshed post count that no longer matches that base means the delta is
 * stale, so the refreshed count wins.
 */
export function displayedCount(count: number, base: number | null, delta: number): number {
  if (base === null || count !== base) return count
  return Math.max(0, count + delta)
}

export function rebaseCount(
  base: number | null,
  delta: number,
  count: number,
): { readonly base: number; readonly delta: number } {
  if (base !== null && base === count) return { base, delta }
  return { base: count, delta: 0 }
}

/**
 * Reconcile one side against the canonical appview state. A local write keeps
 * winning until its confirmation deadline, because an appview read can still
 * describe the state from before that write.
 */
export function reconcileSide(
  entry: ActionEntry,
  side: 'like' | 'repost',
  canonical: string | null,
  now: number,
): Partial<ActionEntry> {
  const writtenAt = side === 'like' ? entry.likeWrittenAt : entry.repostWrittenAt
  const localUri = side === 'like' ? entry.likeUri : entry.repostUri
  const confirming = writtenAt !== null && now - writtenAt < WRITE_CONFIRMATION_TIME

  if (canonical === localUri) {
    // the appview caught up: acknowledge and drop the delta's protection
    return side === 'like'
      ? { likeCheckedAt: now, likeWrittenAt: null }
      : { repostCheckedAt: now, repostWrittenAt: null }
  }

  if (confirming) return {}

  return side === 'like'
    ? {
        likeUri: canonical,
        likeDelta: 0,
        likeBaseCount: null,
        likeCheckedAt: now,
        likeWrittenAt: null,
      }
    : {
        repostUri: canonical,
        repostDelta: 0,
        repostBaseCount: null,
        repostCheckedAt: now,
        repostWrittenAt: null,
      }
}

/**
 * Applies one canonical viewer read. Only an entry object that is identical to
 * the entry captured when the read started may consume its result; a local
 * action that replaced the entry in the meantime leaves the stale read with
 * nothing to do.
 *
 * Returns the input record unchanged when no entry consumed a change, and
 * preserves the identity of every untouched entry.
 */
export function applyViewerRead(
  current: ActionEntries,
  captured: Readonly<Record<string, ActionEntry | undefined>>,
  states: ReadonlyMap<string, ViewerState>,
  now: number,
): ActionEntries {
  let next: Record<string, ActionEntry> | null = null
  for (const [uri, viewer] of states) {
    if (current[uri] !== captured[uri]) continue
    const base = current[uri] ?? EMPTY_ENTRY
    const patch: Partial<ActionEntry> = {
      ...reconcileSide(base, 'like', viewer.likeUri, now),
      ...reconcileSide(base, 'repost', viewer.repostUri, now),
    }
    if (Object.keys(patch).length === 0) continue
    if (next === null) next = { ...current }
    next[uri] = { ...base, ...patch }
  }
  return next ?? current
}

/**
 * A newer canonical snapshot that disagrees with a stored base makes its delta
 * permanently stale; leaving the delta in place would revive it on the next
 * snapshot that happens to match the old base again.
 *
 * Returns the input record unchanged when no entry retired a delta.
 */
export function retireCounts(
  current: ActionEntries,
  snapshots: readonly PostCountSnapshot[],
): ActionEntries {
  let next: Record<string, ActionEntry> | null = null
  for (const snapshot of snapshots) {
    const entry = (next ?? current)[snapshot.uri]
    if (entry === undefined) continue
    const retireLike =
      entry.likeBaseCount !== null &&
      entry.likeBaseCount !== snapshot.likeCount &&
      entry.likeDelta !== 0
    const retireRepost =
      entry.repostBaseCount !== null &&
      entry.repostBaseCount !== snapshot.repostCount &&
      entry.repostDelta !== 0
    if (!retireLike && !retireRepost) continue
    if (next === null) next = { ...current }
    next[snapshot.uri] = {
      ...entry,
      ...(retireLike ? { likeBaseCount: null, likeDelta: 0 } : {}),
      ...(retireRepost ? { repostBaseCount: null, repostDelta: 0 } : {}),
    }
  }
  return next ?? current
}
