// SPDX-License-Identifier: GPL-3.0-only
import { Match } from 'effect'

/**
 * Framework-free playback facts for one video element.
 *
 * The states mirror the source player's phase/error split without carrying
 * React state or DOM handles. Counters live on every state that can be
 * playing, so a retry or a load failure never resets the displayed clock.
 */

type PlaybackCounters = {
  readonly playing: boolean
  readonly current: number
  readonly duration: number
}

/**
 * `Unavailable` means the post exposes no playlist at all, `Poster` means the
 * reader has not activated playback yet, and the remaining states are the
 * activated attempt's phase plus the last known playback counters. Ended
 * playback is `Ready` with `playing: false`.
 */
export type MediaState =
  | { readonly _tag: 'Unavailable' }
  | { readonly _tag: 'Poster' }
  | ({ readonly _tag: 'Loading' } & PlaybackCounters)
  | ({ readonly _tag: 'Ready' } & PlaybackCounters)
  | ({ readonly _tag: 'LoadFailed' } & PlaybackCounters)
  | ({ readonly _tag: 'Unsupported' } & PlaybackCounters)

/** Facts published by a video element and its transport. */
export type MediaEvent =
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Playing' }
  | { readonly _tag: 'Paused' }
  | { readonly _tag: 'Ended' }
  | { readonly _tag: 'PositionChanged'; readonly current: number; readonly duration: number }
  | { readonly _tag: 'LoadFailed' }
  | { readonly _tag: 'Unsupported' }

const ZERO_COUNTERS: PlaybackCounters = { playing: false, current: 0, duration: 0 }

function countersOf(state: MediaState): PlaybackCounters {
  return state._tag === 'Unavailable' || state._tag === 'Poster'
    ? ZERO_COUNTERS
    : { playing: state.playing, current: state.current, duration: state.duration }
}

/**
 * Fold one media fact into the player state.
 *
 * A read before activation (`Poster`) never invents a load failure: the
 * browser adapter filters native errors until a source is attached. `Ready`
 * also accepts a retry from `LoadFailed`/`Unsupported` and keeps the counters
 * from before the failure, matching the source player's retained clock.
 */
export function reduceMedia(state: MediaState, event: MediaEvent): MediaState {
  if (state._tag === 'Unavailable') return state

  const counters = countersOf(state)

  return Match.value(event).pipe(
    Match.withReturnType<MediaState>(),
    Match.tag('Ready', () => ({ _tag: 'Ready', ...counters })),
    Match.tag('Playing', () => ({ _tag: 'Ready', ...counters, playing: true })),
    Match.tag('Paused', () => (state._tag === 'Poster' ? state : { ...state, playing: false })),
    Match.tag('Ended', () =>
      state._tag === 'Poster' ? state : { _tag: 'Ready', ...counters, playing: false },
    ),
    Match.tag('PositionChanged', ({ current, duration }) =>
      state._tag === 'Poster'
        ? state
        : {
            ...state,
            current,
            duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
          },
    ),
    Match.tag('LoadFailed', () =>
      state._tag === 'Poster' ? state : { _tag: 'LoadFailed', ...counters, playing: false },
    ),
    Match.tag('Unsupported', () => ({ _tag: 'Unsupported', ...counters, playing: false })),
    Match.exhaustive,
  )
}

/**
 * Format a playback position as `m:ss`.
 *
 * Non-finite and negative values normalize to `0:00`, matching the source
 * player, and whole seconds are floored rather than rounded.
 */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
